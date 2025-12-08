/**
 * Guided Tours for Enterprise Features (T371, T372)
 * Interactive step-by-step guides for SSO and white-label setup
 */

import React, { useState, useCallback, useEffect, createContext, useContext } from 'react';

// =============================================================================
// Types
// =============================================================================

export interface TourStep {
  id: string;
  target: string; // CSS selector for the target element
  title: string;
  content: string;
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  spotlightPadding?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
  waitFor?: string; // CSS selector to wait for before showing step
  optional?: boolean;
  showSkip?: boolean;
}

export interface Tour {
  id: string;
  name: string;
  description: string;
  steps: TourStep[];
  onComplete?: () => void;
  onSkip?: () => void;
}

interface TourState {
  activeTour: Tour | null;
  currentStepIndex: number;
  isVisible: boolean;
}

interface TourContextValue {
  state: TourState;
  startTour: (tour: Tour) => void;
  endTour: () => void;
  nextStep: () => void;
  prevStep: () => void;
  goToStep: (index: number) => void;
  skipTour: () => void;
}

// =============================================================================
// Context
// =============================================================================

const TourContext = createContext<TourContextValue | null>(null);

export function useTour() {
  const context = useContext(TourContext);
  if (!context) {
    throw new Error('useTour must be used within a TourProvider');
  }
  return context;
}

// =============================================================================
// Provider
// =============================================================================

export function TourProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<TourState>({
    activeTour: null,
    currentStepIndex: 0,
    isVisible: false,
  });

  const startTour = useCallback((tour: Tour) => {
    setState({
      activeTour: tour,
      currentStepIndex: 0,
      isVisible: true,
    });
  }, []);

  const endTour = useCallback(() => {
    if (state.activeTour?.onComplete) {
      state.activeTour.onComplete();
    }
    setState({
      activeTour: null,
      currentStepIndex: 0,
      isVisible: false,
    });
  }, [state.activeTour]);

  const skipTour = useCallback(() => {
    if (state.activeTour?.onSkip) {
      state.activeTour.onSkip();
    }
    setState({
      activeTour: null,
      currentStepIndex: 0,
      isVisible: false,
    });
  }, [state.activeTour]);

  const nextStep = useCallback(() => {
    setState((prev) => {
      if (!prev.activeTour) return prev;
      const nextIndex = prev.currentStepIndex + 1;
      if (nextIndex >= prev.activeTour.steps.length) {
        // Tour complete
        if (prev.activeTour.onComplete) {
          prev.activeTour.onComplete();
        }
        return {
          activeTour: null,
          currentStepIndex: 0,
          isVisible: false,
        };
      }
      return {
        ...prev,
        currentStepIndex: nextIndex,
      };
    });
  }, []);

  const prevStep = useCallback(() => {
    setState((prev) => ({
      ...prev,
      currentStepIndex: Math.max(0, prev.currentStepIndex - 1),
    }));
  }, []);

  const goToStep = useCallback((index: number) => {
    setState((prev) => {
      if (!prev.activeTour) return prev;
      const clampedIndex = Math.max(0, Math.min(index, prev.activeTour.steps.length - 1));
      return {
        ...prev,
        currentStepIndex: clampedIndex,
      };
    });
  }, []);

  const value: TourContextValue = {
    state,
    startTour,
    endTour,
    nextStep,
    prevStep,
    goToStep,
    skipTour,
  };

  return (
    <TourContext.Provider value={value}>
      {children}
      {state.isVisible && state.activeTour && (
        <TourOverlay
          tour={state.activeTour}
          currentStep={state.currentStepIndex}
          onNext={nextStep}
          onPrev={prevStep}
          onSkip={skipTour}
          onEnd={endTour}
        />
      )}
    </TourContext.Provider>
  );
}

// =============================================================================
// Tour Overlay Component
// =============================================================================

interface TourOverlayProps {
  tour: Tour;
  currentStep: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
  onEnd: () => void;
}

function TourOverlay({ tour, currentStep, onNext, onPrev, onSkip, onEnd }: TourOverlayProps) {
  const step = tour.steps[currentStep];
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [ready, setReady] = useState(false);

  // Find target element and get its position
  useEffect(() => {
    const findTarget = () => {
      const target = document.querySelector(step.target);
      if (target) {
        setTargetRect(target.getBoundingClientRect());
        setReady(true);
        // Scroll target into view
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (step.waitFor) {
        // Wait for element to appear
        const observer = new MutationObserver(() => {
          const el = document.querySelector(step.target);
          if (el) {
            setTargetRect(el.getBoundingClientRect());
            setReady(true);
            observer.disconnect();
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        return () => observer.disconnect();
      } else {
        // No target, show centered
        setTargetRect(null);
        setReady(true);
      }
    };

    setReady(false);
    const timer = setTimeout(findTarget, 100);
    return () => clearTimeout(timer);
  }, [step]);

  // Update position on resize
  useEffect(() => {
    const handleResize = () => {
      const target = document.querySelector(step.target);
      if (target) {
        setTargetRect(target.getBoundingClientRect());
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [step.target]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onSkip();
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        if (currentStep < tour.steps.length - 1) {
          onNext();
        } else {
          onEnd();
        }
      } else if (e.key === 'ArrowLeft') {
        onPrev();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentStep, tour.steps.length, onNext, onPrev, onSkip, onEnd]);

  const isLastStep = currentStep === tour.steps.length - 1;
  const padding = step.spotlightPadding ?? 8;

  // Calculate tooltip position
  const getTooltipPosition = () => {
    if (!targetRect || step.position === 'center') {
      return {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      };
    }

    const position = step.position || 'bottom';
    const gap = 16;

    switch (position) {
      case 'top':
        return {
          bottom: `${window.innerHeight - targetRect.top + gap}px`,
          left: `${targetRect.left + targetRect.width / 2}px`,
          transform: 'translateX(-50%)',
        };
      case 'bottom':
        return {
          top: `${targetRect.bottom + gap}px`,
          left: `${targetRect.left + targetRect.width / 2}px`,
          transform: 'translateX(-50%)',
        };
      case 'left':
        return {
          top: `${targetRect.top + targetRect.height / 2}px`,
          right: `${window.innerWidth - targetRect.left + gap}px`,
          transform: 'translateY(-50%)',
        };
      case 'right':
        return {
          top: `${targetRect.top + targetRect.height / 2}px`,
          left: `${targetRect.right + gap}px`,
          transform: 'translateY(-50%)',
        };
      default:
        return {};
    }
  };

  if (!ready) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[9999]">
      {/* Backdrop with spotlight cutout */}
      <svg className="absolute inset-0 w-full h-full">
        <defs>
          <mask id="spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect
                x={targetRect.left - padding}
                y={targetRect.top - padding}
                width={targetRect.width + padding * 2}
                height={targetRect.height + padding * 2}
                rx="8"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.5)"
          mask="url(#spotlight-mask)"
        />
      </svg>

      {/* Spotlight border */}
      {targetRect && (
        <div
          className="absolute border-2 border-blue-500 rounded-lg pointer-events-none"
          style={{
            top: targetRect.top - padding,
            left: targetRect.left - padding,
            width: targetRect.width + padding * 2,
            height: targetRect.height + padding * 2,
            boxShadow: '0 0 0 4px rgba(59, 130, 246, 0.3)',
          }}
        />
      )}

      {/* Tooltip */}
      <div
        className="absolute bg-white rounded-xl shadow-2xl p-6 max-w-md z-10"
        style={getTooltipPosition()}
      >
        {/* Progress indicator */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-gray-500">
            Step {currentStep + 1} of {tour.steps.length}
          </span>
          <div className="flex gap-1">
            {tour.steps.map((_, index) => (
              <div
                key={index}
                className={`w-2 h-2 rounded-full transition-colors ${
                  index === currentStep
                    ? 'bg-blue-600'
                    : index < currentStep
                    ? 'bg-blue-300'
                    : 'bg-gray-200'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{step.title}</h3>
        <p className="text-gray-600 mb-6">{step.content}</p>

        {/* Custom action */}
        {step.action && (
          <button
            onClick={step.action.onClick}
            className="w-full mb-4 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            {step.action.label}
          </button>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <div>
            {(step.showSkip ?? currentStep === 0) && (
              <button
                onClick={onSkip}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Skip tour
              </button>
            )}
          </div>
          <div className="flex gap-2">
            {currentStep > 0 && (
              <button
                onClick={onPrev}
                className="px-4 py-2 text-gray-600 hover:text-gray-900"
              >
                Back
              </button>
            )}
            <button
              onClick={isLastStep ? onEnd : onNext}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {isLastStep ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// SSO Setup Tour (T371)
// =============================================================================

export const SSO_SETUP_TOUR: Tour = {
  id: 'sso-setup',
  name: 'SSO Configuration Guide',
  description: 'Learn how to configure Single Sign-On for your organization',
  steps: [
    {
      id: 'welcome',
      target: '[data-tour="sso-header"]',
      title: 'Welcome to SSO Setup',
      content:
        'Single Sign-On (SSO) allows your team members to log in using your organization\'s identity provider. Let\'s walk through the setup process.',
      position: 'bottom',
      showSkip: true,
    },
    {
      id: 'choose-provider',
      target: '[data-tour="sso-providers"]',
      title: 'Choose Your Provider',
      content:
        'Select your identity provider from the list. We support SAML 2.0, OpenID Connect (OIDC), and direct integrations with Azure AD, Okta, and Google Workspace.',
      position: 'bottom',
    },
    {
      id: 'saml-config',
      target: '[data-tour="saml-config"]',
      title: 'SAML Configuration',
      content:
        'For SAML, you\'ll need to provide the Identity Provider Entity ID, SSO URL, and upload or paste the certificate. You can find these in your IdP\'s admin console.',
      position: 'right',
      optional: true,
    },
    {
      id: 'oidc-config',
      target: '[data-tour="oidc-config"]',
      title: 'OIDC Configuration',
      content:
        'For OIDC, enter your Client ID, Client Secret, and the Discovery URL (usually ends in /.well-known/openid-configuration).',
      position: 'right',
      optional: true,
    },
    {
      id: 'attribute-mapping',
      target: '[data-tour="attribute-mapping"]',
      title: 'Attribute Mapping',
      content:
        'Map your IdP\'s user attributes to Foundry fields. At minimum, you\'ll need to map email and name. You can also map department and role for automatic provisioning.',
      position: 'left',
    },
    {
      id: 'domain-verification',
      target: '[data-tour="domain-verification"]',
      title: 'Verify Your Domain',
      content:
        'Add and verify your email domain to enable SSO for all users with that domain. We\'ll provide a DNS TXT record to add to your domain.',
      position: 'bottom',
    },
    {
      id: 'test-connection',
      target: '[data-tour="test-sso"]',
      title: 'Test Your Configuration',
      content:
        'Before enabling SSO for everyone, test the connection with a single user. This helps catch any configuration issues early.',
      position: 'left',
      action: {
        label: 'Test Connection',
        onClick: () => {
          // Trigger test connection
          document.querySelector<HTMLButtonElement>('[data-tour="test-sso"] button')?.click();
        },
      },
    },
    {
      id: 'enable-sso',
      target: '[data-tour="enable-sso"]',
      title: 'Enable SSO',
      content:
        'Once testing is successful, you can enable SSO for your organization. You can choose to require SSO for all users or allow both SSO and password login.',
      position: 'top',
    },
    {
      id: 'complete',
      target: '[data-tour="sso-header"]',
      title: 'Setup Complete!',
      content:
        'Congratulations! Your SSO is configured. Users with verified domains will now be able to sign in using your identity provider. You can always return here to modify settings.',
      position: 'center',
    },
  ],
  onComplete: () => {
    localStorage.setItem('foundry_sso_tour_completed', 'true');
  },
  onSkip: () => {
    localStorage.setItem('foundry_sso_tour_skipped', 'true');
  },
};

// =============================================================================
// White Label Setup Tour (T372)
// =============================================================================

export const WHITE_LABEL_TOUR: Tour = {
  id: 'white-label-setup',
  name: 'White Label Customization Guide',
  description: 'Customize Foundry with your organization\'s branding',
  steps: [
    {
      id: 'welcome',
      target: '[data-tour="branding-header"]',
      title: 'Welcome to White Label Setup',
      content:
        'White labeling lets you customize Foundry with your organization\'s branding, including logos, colors, and custom domains. Let\'s set up your brand.',
      position: 'bottom',
      showSkip: true,
    },
    {
      id: 'preview',
      target: '[data-tour="brand-preview"]',
      title: 'Live Preview',
      content:
        'As you make changes, you\'ll see a live preview of how your branding will look. This updates in real-time so you can perfect your design.',
      position: 'left',
    },
    {
      id: 'logo-upload',
      target: '[data-tour="logo-upload"]',
      title: 'Upload Your Logo',
      content:
        'Start by uploading your organization\'s logo. We recommend using a transparent PNG at least 200x50 pixels. You can upload separate logos for light and dark modes.',
      position: 'right',
    },
    {
      id: 'favicon',
      target: '[data-tour="favicon-upload"]',
      title: 'Set Your Favicon',
      content:
        'Upload a favicon that will appear in browser tabs. Use a square image (at least 32x32 pixels) for best results.',
      position: 'right',
    },
    {
      id: 'color-scheme',
      target: '[data-tour="color-scheme"]',
      title: 'Choose Your Colors',
      content:
        'Select your primary, secondary, and accent colors. These will be used throughout the interface for buttons, links, and highlights.',
      position: 'left',
      action: {
        label: 'Use Brand Colors',
        onClick: () => {
          // Open color picker
          document.querySelector<HTMLButtonElement>('[data-tour="color-scheme"] button')?.click();
        },
      },
    },
    {
      id: 'typography',
      target: '[data-tour="typography"]',
      title: 'Typography Settings',
      content:
        'Choose fonts that match your brand. You can select from our curated list or use Google Fonts. Custom fonts can be uploaded in the advanced settings.',
      position: 'right',
      optional: true,
    },
    {
      id: 'custom-domain',
      target: '[data-tour="custom-domain"]',
      title: 'Custom Domain',
      content:
        'Set up a custom domain like "app.yourcompany.com". We\'ll provide the DNS records you need to add. SSL certificates are automatically provisioned.',
      position: 'bottom',
    },
    {
      id: 'email-branding',
      target: '[data-tour="email-branding"]',
      title: 'Email Branding',
      content:
        'Customize the emails sent from Foundry. Add your logo, adjust colors, and set a custom sender address (requires domain verification).',
      position: 'left',
    },
    {
      id: 'login-page',
      target: '[data-tour="login-customization"]',
      title: 'Login Page',
      content:
        'Design a custom login page with your branding. You can add a background image, customize the layout, and include your organization\'s tagline.',
      position: 'right',
    },
    {
      id: 'save-publish',
      target: '[data-tour="publish-branding"]',
      title: 'Save & Publish',
      content:
        'When you\'re happy with your branding, save and publish your changes. They\'ll be applied immediately across all users in your organization.',
      position: 'top',
    },
    {
      id: 'complete',
      target: '[data-tour="branding-header"]',
      title: 'Branding Complete!',
      content:
        'Your white label setup is complete! Your organization\'s branding will now be visible to all users. You can return here anytime to make adjustments.',
      position: 'center',
    },
  ],
  onComplete: () => {
    localStorage.setItem('foundry_whitelabel_tour_completed', 'true');
  },
  onSkip: () => {
    localStorage.setItem('foundry_whitelabel_tour_skipped', 'true');
  },
};

// =============================================================================
// Entity Setup Tour
// =============================================================================

export const ENTITY_SETUP_TOUR: Tour = {
  id: 'entity-setup',
  name: 'Multi-Entity Setup Guide',
  description: 'Learn how to set up and manage multiple entities',
  steps: [
    {
      id: 'welcome',
      target: '[data-tour="entity-header"]',
      title: 'Welcome to Entity Management',
      content:
        'Entities let you manage multiple organizations, subsidiaries, or clients from a single Foundry account. Each entity has its own data, users, and settings.',
      position: 'bottom',
      showSkip: true,
    },
    {
      id: 'entity-tree',
      target: '[data-tour="entity-tree"]',
      title: 'Entity Hierarchy',
      content:
        'Entities can be organized in a hierarchy. Child entities inherit settings from their parent, making it easy to manage large organizations.',
      position: 'right',
    },
    {
      id: 'create-entity',
      target: '[data-tour="create-entity"]',
      title: 'Create an Entity',
      content:
        'Click here to create a new entity. You\'ll be able to set its name, slug (URL identifier), and choose its parent entity if applicable.',
      position: 'left',
    },
    {
      id: 'entity-settings',
      target: '[data-tour="entity-settings"]',
      title: 'Entity Settings',
      content:
        'Each entity has its own settings for branding, integrations, and user management. Changes here only affect the selected entity.',
      position: 'right',
    },
    {
      id: 'entity-switching',
      target: '[data-tour="entity-selector"]',
      title: 'Switch Between Entities',
      content:
        'Use this selector to switch between entities. Keyboard shortcut: Ctrl+E opens the selector, Ctrl+1-9 switches directly to entities.',
      position: 'bottom',
    },
    {
      id: 'cross-entity-reporting',
      target: '[data-tour="cross-entity-reports"]',
      title: 'Cross-Entity Reports',
      content:
        'View aggregated data across multiple entities. Perfect for executive dashboards and comparing performance between subsidiaries.',
      position: 'left',
    },
    {
      id: 'complete',
      target: '[data-tour="entity-header"]',
      title: 'You\'re All Set!',
      content:
        'You now know the basics of entity management. Start by creating your organizational structure, then invite users to each entity.',
      position: 'center',
    },
  ],
  onComplete: () => {
    localStorage.setItem('foundry_entity_tour_completed', 'true');
  },
  onSkip: () => {
    localStorage.setItem('foundry_entity_tour_skipped', 'true');
  },
};

// =============================================================================
// Tour Trigger Components
// =============================================================================

interface TourTriggerProps {
  tour: Tour;
  children: React.ReactNode;
  className?: string;
}

export function TourTrigger({ tour, children, className }: TourTriggerProps) {
  const { startTour } = useTour();

  return (
    <button onClick={() => startTour(tour)} className={className}>
      {children}
    </button>
  );
}

interface TourHintProps {
  tourId: string;
  children: React.ReactNode;
  showWhen?: 'always' | 'not-completed' | 'not-started';
}

export function TourHint({ tourId, children, showWhen = 'not-completed' }: TourHintProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const completed = localStorage.getItem(`foundry_${tourId}_tour_completed`);
    const skipped = localStorage.getItem(`foundry_${tourId}_tour_skipped`);

    if (showWhen === 'always') {
      setShow(true);
    } else if (showWhen === 'not-completed' && !completed) {
      setShow(true);
    } else if (showWhen === 'not-started' && !completed && !skipped) {
      setShow(true);
    }
  }, [tourId, showWhen]);

  if (!show) return null;

  return <>{children}</>;
}

// =============================================================================
// Start Tour Button Component
// =============================================================================

interface StartTourButtonProps {
  tour: Tour;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

export function StartTourButton({
  tour,
  variant = 'secondary',
  size = 'md',
  showIcon = true,
}: StartTourButtonProps) {
  const { startTour } = useTour();

  const baseClasses = 'inline-flex items-center gap-2 font-medium rounded-lg transition-colors';
  const variantClasses = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
    ghost: 'text-blue-600 hover:text-blue-700 hover:bg-blue-50',
  };
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2',
    lg: 'px-5 py-2.5 text-lg',
  };

  return (
    <button
      onClick={() => startTour(tour)}
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]}`}
    >
      {showIcon && (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      )}
      Take the Tour
    </button>
  );
}

export default {
  TourProvider,
  useTour,
  TourTrigger,
  TourHint,
  StartTourButton,
  SSO_SETUP_TOUR,
  WHITE_LABEL_TOUR,
  ENTITY_SETUP_TOUR,
};
