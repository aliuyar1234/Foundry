-- =============================================================================
-- Row-Level Security (RLS) Policies for Multi-Tenant Data Isolation
-- SCALE Tier - Tasks T005-T009
-- =============================================================================

-- T006: Function to set entity context for RLS policies
CREATE OR REPLACE FUNCTION set_entity_context(
  p_entity_id uuid,
  p_user_id uuid,
  p_is_super_admin boolean DEFAULT false
) RETURNS void AS $$
BEGIN
  PERFORM set_config('app.current_entity_id', COALESCE(p_entity_id::text, ''), true);
  PERFORM set_config('app.current_user_id', COALESCE(p_user_id::text, ''), true);
  PERFORM set_config('app.is_super_admin', p_is_super_admin::text, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to get current entity ID from context
CREATE OR REPLACE FUNCTION get_current_entity_id() RETURNS uuid AS $$
DECLARE
  entity_id text;
BEGIN
  entity_id := current_setting('app.current_entity_id', true);
  IF entity_id IS NULL OR entity_id = '' THEN
    RETURN NULL;
  END IF;
  RETURN entity_id::uuid;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- Helper function to get current user ID from context
CREATE OR REPLACE FUNCTION get_current_user_id() RETURNS uuid AS $$
DECLARE
  user_id text;
BEGIN
  user_id := current_setting('app.current_user_id', true);
  IF user_id IS NULL OR user_id = '' THEN
    RETURN NULL;
  END IF;
  RETURN user_id::uuid;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- Helper function to check if current user is super admin
CREATE OR REPLACE FUNCTION is_super_admin() RETURNS boolean AS $$
BEGIN
  RETURN COALESCE(current_setting('app.is_super_admin', true)::boolean, false);
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$ LANGUAGE plpgsql STABLE;

-- Helper function to get authorized entity IDs for cross-entity access
CREATE OR REPLACE FUNCTION get_authorized_entity_ids() RETURNS uuid[] AS $$
DECLARE
  user_id uuid;
  entity_ids uuid[];
BEGIN
  user_id := get_current_user_id();
  IF user_id IS NULL THEN
    RETURN ARRAY[]::uuid[];
  END IF;

  SELECT ARRAY_AGG(entity_id) INTO entity_ids
  FROM "UserEntityPermission"
  WHERE "userId" = user_id::text AND "canRead" = true;

  RETURN COALESCE(entity_ids, ARRAY[]::uuid[]);
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- T007: Enable RLS on tenant-scoped tables
-- =============================================================================

-- Note: These tables need to have an entityId column added first
-- For existing tables, we use organizationId as the tenant identifier

-- Enable RLS on DataSource table
ALTER TABLE "DataSource" ENABLE ROW LEVEL SECURITY;

-- Enable RLS on SyncJob table
ALTER TABLE "SyncJob" ENABLE ROW LEVEL SECURITY;

-- Enable RLS on Assessment table
ALTER TABLE "Assessment" ENABLE ROW LEVEL SECURITY;

-- Enable RLS on SOP table
ALTER TABLE "SOP" ENABLE ROW LEVEL SECURITY;

-- Enable RLS on EntityRecord table
ALTER TABLE "EntityRecord" ENABLE ROW LEVEL SECURITY;

-- Enable RLS on AuditLog table
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;

-- Enable RLS on RoutingRule table
ALTER TABLE "RoutingRule" ENABLE ROW LEVEL SECURITY;

-- Enable RLS on RoutingDecision table
ALTER TABLE "RoutingDecision" ENABLE ROW LEVEL SECURITY;

-- Enable RLS on ExpertiseProfile table
ALTER TABLE "ExpertiseProfile" ENABLE ROW LEVEL SECURITY;

-- Enable RLS on ConversationSession table
ALTER TABLE "ConversationSession" ENABLE ROW LEVEL SECURITY;

-- Enable RLS on ConversationMessage table
ALTER TABLE "ConversationMessage" ENABLE ROW LEVEL SECURITY;

-- Enable RLS on AutomatedAction table
ALTER TABLE "AutomatedAction" ENABLE ROW LEVEL SECURITY;

-- Enable RLS on ActionExecution table
ALTER TABLE "ActionExecution" ENABLE ROW LEVEL SECURITY;

-- Enable RLS on ComplianceRule table
ALTER TABLE "ComplianceRule" ENABLE ROW LEVEL SECURITY;

-- Enable RLS on ComplianceEvidence table
ALTER TABLE "ComplianceEvidence" ENABLE ROW LEVEL SECURITY;

-- Enable RLS on ComplianceViolation table
ALTER TABLE "ComplianceViolation" ENABLE ROW LEVEL SECURITY;

-- Enable RLS on DashboardWidget table
ALTER TABLE "DashboardWidget" ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- T008: Entity isolation policy - restricts access to own entity data
-- =============================================================================

-- DataSource isolation policy
CREATE POLICY entity_isolation_policy_datasource ON "DataSource"
  FOR ALL
  USING (
    "organizationId" = get_current_entity_id()::text
    OR is_super_admin() = true
  );

-- SyncJob isolation (via DataSource)
CREATE POLICY entity_isolation_policy_syncjob ON "SyncJob"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "DataSource" ds
      WHERE ds.id = "SyncJob"."dataSourceId"
      AND (ds."organizationId" = get_current_entity_id()::text OR is_super_admin() = true)
    )
  );

-- Assessment isolation policy
CREATE POLICY entity_isolation_policy_assessment ON "Assessment"
  FOR ALL
  USING (
    "organizationId" = get_current_entity_id()::text
    OR is_super_admin() = true
  );

-- SOP isolation policy
CREATE POLICY entity_isolation_policy_sop ON "SOP"
  FOR ALL
  USING (
    "organizationId" = get_current_entity_id()::text
    OR is_super_admin() = true
  );

-- EntityRecord isolation policy
CREATE POLICY entity_isolation_policy_entityrecord ON "EntityRecord"
  FOR ALL
  USING (
    "organizationId" = get_current_entity_id()::text
    OR is_super_admin() = true
  );

-- AuditLog isolation policy
CREATE POLICY entity_isolation_policy_auditlog ON "AuditLog"
  FOR ALL
  USING (
    "organizationId" = get_current_entity_id()::text
    OR is_super_admin() = true
  );

-- RoutingRule isolation policy
CREATE POLICY entity_isolation_policy_routingrule ON "RoutingRule"
  FOR ALL
  USING (
    "organizationId" = get_current_entity_id()::text
    OR is_super_admin() = true
  );

-- RoutingDecision isolation policy
CREATE POLICY entity_isolation_policy_routingdecision ON "RoutingDecision"
  FOR ALL
  USING (
    "organizationId" = get_current_entity_id()::text
    OR is_super_admin() = true
  );

-- ExpertiseProfile isolation policy
CREATE POLICY entity_isolation_policy_expertiseprofile ON "ExpertiseProfile"
  FOR ALL
  USING (
    "organizationId" = get_current_entity_id()::text
    OR is_super_admin() = true
  );

-- ConversationSession isolation policy
CREATE POLICY entity_isolation_policy_conversationsession ON "ConversationSession"
  FOR ALL
  USING (
    "organizationId" = get_current_entity_id()::text
    OR is_super_admin() = true
  );

-- ConversationMessage isolation (via session)
CREATE POLICY entity_isolation_policy_conversationmessage ON "ConversationMessage"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM "ConversationSession" cs
      WHERE cs.id = "ConversationMessage"."sessionId"
      AND (cs."organizationId" = get_current_entity_id()::text OR is_super_admin() = true)
    )
  );

-- AutomatedAction isolation policy
CREATE POLICY entity_isolation_policy_automatedaction ON "AutomatedAction"
  FOR ALL
  USING (
    "organizationId" = get_current_entity_id()::text
    OR is_super_admin() = true
  );

-- ActionExecution isolation policy
CREATE POLICY entity_isolation_policy_actionexecution ON "ActionExecution"
  FOR ALL
  USING (
    "organizationId" = get_current_entity_id()::text
    OR is_super_admin() = true
  );

-- ComplianceRule isolation policy
CREATE POLICY entity_isolation_policy_compliancerule ON "ComplianceRule"
  FOR ALL
  USING (
    "organizationId" = get_current_entity_id()::text
    OR is_super_admin() = true
  );

-- ComplianceEvidence isolation policy
CREATE POLICY entity_isolation_policy_complianceevidence ON "ComplianceEvidence"
  FOR ALL
  USING (
    "organizationId" = get_current_entity_id()::text
    OR is_super_admin() = true
  );

-- ComplianceViolation isolation policy
CREATE POLICY entity_isolation_policy_complianceviolation ON "ComplianceViolation"
  FOR ALL
  USING (
    "organizationId" = get_current_entity_id()::text
    OR is_super_admin() = true
  );

-- DashboardWidget isolation policy
CREATE POLICY entity_isolation_policy_dashboardwidget ON "DashboardWidget"
  FOR ALL
  USING (
    "organizationId" = get_current_entity_id()::text
    OR is_super_admin() = true
  );

-- =============================================================================
-- T009: Cross-entity read policy for authorized users
-- =============================================================================

-- Cross-entity read for DataSource
CREATE POLICY cross_entity_read_policy_datasource ON "DataSource"
  FOR SELECT
  USING (
    "organizationId"::uuid = ANY(get_authorized_entity_ids())
  );

-- Cross-entity read for Assessment
CREATE POLICY cross_entity_read_policy_assessment ON "Assessment"
  FOR SELECT
  USING (
    "organizationId"::uuid = ANY(get_authorized_entity_ids())
  );

-- Cross-entity read for SOP
CREATE POLICY cross_entity_read_policy_sop ON "SOP"
  FOR SELECT
  USING (
    "organizationId"::uuid = ANY(get_authorized_entity_ids())
  );

-- Cross-entity read for RoutingDecision (analytics)
CREATE POLICY cross_entity_read_policy_routingdecision ON "RoutingDecision"
  FOR SELECT
  USING (
    "organizationId"::uuid = ANY(get_authorized_entity_ids())
  );

-- Cross-entity read for ComplianceViolation (compliance dashboard)
CREATE POLICY cross_entity_read_policy_complianceviolation ON "ComplianceViolation"
  FOR SELECT
  USING (
    "organizationId"::uuid = ANY(get_authorized_entity_ids())
  );

-- =============================================================================
-- Grant usage to application role
-- =============================================================================

-- Create application role if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'foundry_app') THEN
    CREATE ROLE foundry_app;
  END IF;
END
$$;

-- Grant execute on RLS functions
GRANT EXECUTE ON FUNCTION set_entity_context(uuid, uuid, boolean) TO foundry_app;
GRANT EXECUTE ON FUNCTION get_current_entity_id() TO foundry_app;
GRANT EXECUTE ON FUNCTION get_current_user_id() TO foundry_app;
GRANT EXECUTE ON FUNCTION is_super_admin() TO foundry_app;
GRANT EXECUTE ON FUNCTION get_authorized_entity_ids() TO foundry_app;

-- =============================================================================
-- Indexes for RLS performance optimization
-- =============================================================================

-- These indexes help RLS policies perform efficiently
CREATE INDEX IF NOT EXISTS idx_datasource_orgid ON "DataSource"("organizationId");
CREATE INDEX IF NOT EXISTS idx_assessment_orgid ON "Assessment"("organizationId");
CREATE INDEX IF NOT EXISTS idx_sop_orgid ON "SOP"("organizationId");
CREATE INDEX IF NOT EXISTS idx_entityrecord_orgid ON "EntityRecord"("organizationId");
CREATE INDEX IF NOT EXISTS idx_auditlog_orgid ON "AuditLog"("organizationId");
CREATE INDEX IF NOT EXISTS idx_routingrule_orgid ON "RoutingRule"("organizationId");
CREATE INDEX IF NOT EXISTS idx_routingdecision_orgid ON "RoutingDecision"("organizationId");
CREATE INDEX IF NOT EXISTS idx_automatedaction_orgid ON "AutomatedAction"("organizationId");
CREATE INDEX IF NOT EXISTS idx_actionexecution_orgid ON "ActionExecution"("organizationId");
CREATE INDEX IF NOT EXISTS idx_compliancerule_orgid ON "ComplianceRule"("organizationId");
CREATE INDEX IF NOT EXISTS idx_complianceevidence_orgid ON "ComplianceEvidence"("organizationId");
CREATE INDEX IF NOT EXISTS idx_complianceviolation_orgid ON "ComplianceViolation"("organizationId");
CREATE INDEX IF NOT EXISTS idx_dashboardwidget_orgid ON "DashboardWidget"("organizationId");
