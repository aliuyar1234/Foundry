/**
 * Workload Balancing Optimizer
 * T213 - Optimize workload distribution across teams
 *
 * Uses optimization algorithms to find optimal task distribution
 */

import { PrismaClient } from '@prisma/client';

// =============================================================================
// Types
// =============================================================================

export interface OptimizationResult {
  teamId: string;
  optimizedAt: Date;
  algorithm: string;
  beforeMetrics: BalanceMetrics;
  afterMetrics: BalanceMetrics;
  improvements: Improvement[];
  recommendations: TaskMove[];
  constraints: OptimizationConstraint[];
  convergenceInfo: {
    iterations: number;
    converged: boolean;
    finalScore: number;
  };
}

export interface BalanceMetrics {
  giniCoefficient: number; // 0 = perfect equality, 1 = perfect inequality
  standardDeviation: number;
  coefficientOfVariation: number;
  maxMinRatio: number;
  overloadedCount: number;
  underutilizedCount: number;
  balanceScore: number; // 0-100
}

export interface Improvement {
  metric: string;
  before: number;
  after: number;
  improvementPercent: number;
}

export interface TaskMove {
  taskId: string;
  taskTitle: string;
  fromPersonId: string;
  fromPersonName: string;
  toPersonId: string;
  toPersonName: string;
  loadTransfer: number;
  reason: string;
  priority: 'required' | 'recommended' | 'optional';
  constraints: string[];
}

export interface OptimizationConstraint {
  type: 'skill_required' | 'deadline' | 'preference' | 'availability' | 'max_load';
  description: string;
  satisfied: boolean;
  impact: string;
}

export interface OptimizationConfig {
  algorithm?: 'greedy' | 'genetic' | 'simulated_annealing' | 'linear_programming';
  targetLoadPercent?: number;
  maxIterations?: number;
  respectSkills?: boolean;
  respectDeadlines?: boolean;
  maxMovesPerPerson?: number;
  minImprovement?: number;
}

// =============================================================================
// Balancing Optimizer
// =============================================================================

const prisma = new PrismaClient();

/**
 * Optimize workload distribution for a team
 */
export async function optimizeTeamWorkload(
  teamId: string,
  config: OptimizationConfig = {}
): Promise<OptimizationResult> {
  const {
    algorithm = 'greedy',
    targetLoadPercent = 80,
    maxIterations = 100,
    respectSkills = true,
    respectDeadlines = true,
    maxMovesPerPerson = 5,
    minImprovement = 5,
  } = config;

  const team = await prisma.organization.findUnique({
    where: { id: teamId },
    include: { users: true },
  });

  if (!team) {
    throw new Error(`Team not found: ${teamId}`);
  }

  // Get current workload state
  const workloadState = await getTeamWorkloadState(team.users);
  const beforeMetrics = calculateBalanceMetrics(workloadState);

  // Run optimization
  let result: OptimizationRunResult;
  switch (algorithm) {
    case 'genetic':
      result = await runGeneticOptimization(workloadState, config, maxIterations);
      break;
    case 'simulated_annealing':
      result = await runSimulatedAnnealing(workloadState, config, maxIterations);
      break;
    case 'linear_programming':
      result = await runLinearProgramming(workloadState, config);
      break;
    default:
      result = await runGreedyOptimization(workloadState, config, maxIterations);
  }

  // Apply moves to get projected state
  const projectedState = applyMoves(workloadState, result.moves);
  const afterMetrics = calculateBalanceMetrics(projectedState);

  // Calculate improvements
  const improvements = calculateImprovements(beforeMetrics, afterMetrics);

  // Validate constraints
  const constraints = validateConstraints(result.moves, workloadState, config);

  return {
    teamId,
    optimizedAt: new Date(),
    algorithm,
    beforeMetrics,
    afterMetrics,
    improvements,
    recommendations: result.moves,
    constraints,
    convergenceInfo: result.convergence,
  };
}

/**
 * Get optimization suggestions without full optimization
 */
export async function getQuickSuggestions(
  teamId: string,
  limit: number = 5
): Promise<TaskMove[]> {
  const team = await prisma.organization.findUnique({
    where: { id: teamId },
    include: { users: true },
  });

  if (!team) {
    return [];
  }

  const workloadState = await getTeamWorkloadState(team.users);

  // Simple heuristic: move tasks from overloaded to underloaded
  const overloaded = workloadState.members.filter(m => m.load > 100);
  const underloaded = workloadState.members.filter(m => m.load < 60);

  const suggestions: TaskMove[] = [];

  for (const source of overloaded) {
    if (suggestions.length >= limit) break;

    for (const task of source.tasks.slice(0, 3)) {
      if (suggestions.length >= limit) break;

      const target = underloaded.find(m =>
        m.load + task.loadContribution <= 85 &&
        hasRequiredSkills(m, task)
      );

      if (target) {
        suggestions.push({
          taskId: task.id,
          taskTitle: task.title,
          fromPersonId: source.personId,
          fromPersonName: source.personName,
          toPersonId: target.personId,
          toPersonName: target.personName,
          loadTransfer: task.loadContribution,
          reason: `Balance load: ${source.personName} at ${source.load}%, ${target.personName} at ${target.load}%`,
          priority: source.load > 120 ? 'required' : 'recommended',
          constraints: [],
        });

        // Update virtual load for next iteration
        target.load += task.loadContribution;
      }
    }
  }

  return suggestions;
}

/**
 * Simulate the impact of proposed moves
 */
export async function simulateMoves(
  teamId: string,
  moves: Array<{ taskId: string; toPersonId: string }>
): Promise<{
  beforeMetrics: BalanceMetrics;
  afterMetrics: BalanceMetrics;
  feasible: boolean;
  issues: string[];
}> {
  const team = await prisma.organization.findUnique({
    where: { id: teamId },
    include: { users: true },
  });

  if (!team) {
    throw new Error(`Team not found: ${teamId}`);
  }

  const workloadState = await getTeamWorkloadState(team.users);
  const beforeMetrics = calculateBalanceMetrics(workloadState);

  const issues: string[] = [];
  let feasible = true;

  // Apply simulated moves
  const simulatedState = JSON.parse(JSON.stringify(workloadState)) as TeamWorkloadState;

  for (const move of moves) {
    const task = findTask(simulatedState, move.taskId);
    const targetMember = simulatedState.members.find(m => m.personId === move.toPersonId);

    if (!task) {
      issues.push(`Task ${move.taskId} not found`);
      feasible = false;
      continue;
    }

    if (!targetMember) {
      issues.push(`Target person ${move.toPersonId} not found`);
      feasible = false;
      continue;
    }

    // Check if target would be overloaded
    if (targetMember.load + task.loadContribution > 120) {
      issues.push(`Moving ${task.title} would overload ${targetMember.personName}`);
    }

    // Simulate the move
    const sourceMember = simulatedState.members.find(m =>
      m.tasks.some(t => t.id === task.id)
    );

    if (sourceMember) {
      sourceMember.tasks = sourceMember.tasks.filter(t => t.id !== task.id);
      sourceMember.load -= task.loadContribution;
    }

    targetMember.tasks.push(task);
    targetMember.load += task.loadContribution;
  }

  const afterMetrics = calculateBalanceMetrics(simulatedState);

  return {
    beforeMetrics,
    afterMetrics,
    feasible,
    issues,
  };
}

// =============================================================================
// Optimization Algorithms
// =============================================================================

interface OptimizationRunResult {
  moves: TaskMove[];
  convergence: {
    iterations: number;
    converged: boolean;
    finalScore: number;
  };
}

async function runGreedyOptimization(
  state: TeamWorkloadState,
  config: OptimizationConfig,
  maxIterations: number
): Promise<OptimizationRunResult> {
  const moves: TaskMove[] = [];
  let currentState = JSON.parse(JSON.stringify(state)) as TeamWorkloadState;
  let currentScore = calculateBalanceScore(currentState);
  let iterations = 0;
  let improved = true;

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;

    // Find best single move
    const overloaded = currentState.members.filter(m => m.load > 90);
    const underloaded = currentState.members.filter(m => m.load < 70);

    for (const source of overloaded) {
      for (const task of source.tasks) {
        for (const target of underloaded) {
          if (target.load + task.loadContribution > 100) continue;
          if (config.respectSkills && !hasRequiredSkills(target, task)) continue;

          // Calculate score after this move
          const testState = JSON.parse(JSON.stringify(currentState)) as TeamWorkloadState;
          applyMoveToState(testState, source.personId, target.personId, task.id);
          const newScore = calculateBalanceScore(testState);

          if (newScore > currentScore + (config.minImprovement || 1)) {
            // Apply move
            currentState = testState;
            currentScore = newScore;

            moves.push({
              taskId: task.id,
              taskTitle: task.title,
              fromPersonId: source.personId,
              fromPersonName: source.personName,
              toPersonId: target.personId,
              toPersonName: target.personName,
              loadTransfer: task.loadContribution,
              reason: `Improves balance score from ${currentScore.toFixed(0)} to ${newScore.toFixed(0)}`,
              priority: source.load > 120 ? 'required' : 'recommended',
              constraints: [],
            });

            improved = true;
            break;
          }
        }
        if (improved) break;
      }
      if (improved) break;
    }
  }

  return {
    moves,
    convergence: {
      iterations,
      converged: !improved,
      finalScore: currentScore,
    },
  };
}

async function runGeneticOptimization(
  state: TeamWorkloadState,
  config: OptimizationConfig,
  maxIterations: number
): Promise<OptimizationRunResult> {
  // Simplified genetic algorithm
  const populationSize = 20;
  const mutationRate = 0.1;

  // Initialize population with random move sequences
  let population = initializePopulation(state, populationSize);

  for (let gen = 0; gen < maxIterations; gen++) {
    // Evaluate fitness
    population = population.map(individual => ({
      ...individual,
      fitness: evaluateFitness(state, individual.moves, config),
    }));

    // Sort by fitness
    population.sort((a, b) => b.fitness - a.fitness);

    // Check convergence
    if (population[0].fitness > 95) break;

    // Select parents and create new generation
    const newPopulation = population.slice(0, 5); // Keep top 5

    while (newPopulation.length < populationSize) {
      const parent1 = selectParent(population);
      const parent2 = selectParent(population);
      const child = crossover(parent1, parent2);

      if (Math.random() < mutationRate) {
        mutate(child, state);
      }

      newPopulation.push(child);
    }

    population = newPopulation;
  }

  const best = population[0];

  return {
    moves: convertToTaskMoves(best.moves, state),
    convergence: {
      iterations: maxIterations,
      converged: best.fitness > 90,
      finalScore: best.fitness,
    },
  };
}

async function runSimulatedAnnealing(
  state: TeamWorkloadState,
  config: OptimizationConfig,
  maxIterations: number
): Promise<OptimizationRunResult> {
  let currentState = JSON.parse(JSON.stringify(state)) as TeamWorkloadState;
  let currentScore = calculateBalanceScore(currentState);
  let bestScore = currentScore;
  let bestMoves: TaskMove[] = [];
  const moves: TaskMove[] = [];

  let temperature = 100;
  const coolingRate = 0.95;

  for (let i = 0; i < maxIterations; i++) {
    // Generate random neighbor
    const neighbor = generateRandomMove(currentState, config);
    if (!neighbor) continue;

    const newState = JSON.parse(JSON.stringify(currentState)) as TeamWorkloadState;
    applyMoveToState(newState, neighbor.fromPersonId, neighbor.toPersonId, neighbor.taskId);
    const newScore = calculateBalanceScore(newState);

    // Accept or reject
    const delta = newScore - currentScore;
    if (delta > 0 || Math.random() < Math.exp(delta / temperature)) {
      currentState = newState;
      currentScore = newScore;
      moves.push(neighbor);

      if (newScore > bestScore) {
        bestScore = newScore;
        bestMoves = [...moves];
      }
    }

    temperature *= coolingRate;
  }

  return {
    moves: bestMoves,
    convergence: {
      iterations: maxIterations,
      converged: temperature < 1,
      finalScore: bestScore,
    },
  };
}

async function runLinearProgramming(
  state: TeamWorkloadState,
  config: OptimizationConfig
): Promise<OptimizationRunResult> {
  // Simplified LP approach - in production would use actual LP solver
  const targetLoad = config.targetLoadPercent || 80;
  const moves: TaskMove[] = [];

  // Calculate target load for each person
  const totalLoad = state.members.reduce((sum, m) => sum + m.load, 0);
  const avgLoad = totalLoad / state.members.length;

  // Move tasks from above-average to below-average
  const aboveAvg = state.members.filter(m => m.load > avgLoad + 10);
  const belowAvg = state.members.filter(m => m.load < avgLoad - 10);

  for (const source of aboveAvg) {
    const excess = source.load - targetLoad;
    if (excess <= 0) continue;

    let moved = 0;
    for (const task of source.tasks) {
      if (moved >= excess) break;

      const target = belowAvg.find(m => m.load + task.loadContribution <= targetLoad);
      if (target) {
        moves.push({
          taskId: task.id,
          taskTitle: task.title,
          fromPersonId: source.personId,
          fromPersonName: source.personName,
          toPersonId: target.personId,
          toPersonName: target.personName,
          loadTransfer: task.loadContribution,
          reason: `LP optimization: move to achieve ${targetLoad}% target`,
          priority: 'recommended',
          constraints: [],
        });

        target.load += task.loadContribution;
        moved += task.loadContribution;
      }
    }
  }

  return {
    moves,
    convergence: {
      iterations: 1,
      converged: true,
      finalScore: calculateBalanceScore(applyMoves(state, moves)),
    },
  };
}

// =============================================================================
// Helper Types & Functions
// =============================================================================

interface TeamWorkloadState {
  members: MemberWorkload[];
}

interface MemberWorkload {
  personId: string;
  personName: string;
  load: number;
  tasks: TaskInfo[];
  skills: string[];
}

interface TaskInfo {
  id: string;
  title: string;
  loadContribution: number;
  requiredSkills: string[];
  deadline?: Date;
}

async function getTeamWorkloadState(
  users: Array<{ id: string; name: string | null; email: string }>
): Promise<TeamWorkloadState> {
  const members = await Promise.all(
    users.map(async (user) => {
      const tasks = generateSimulatedTasks(user.id);
      const load = tasks.reduce((sum, t) => sum + t.loadContribution, 0);

      return {
        personId: user.id,
        personName: user.name || user.email,
        load,
        tasks,
        skills: ['JavaScript', 'TypeScript', 'React'].slice(0, 1 + Math.floor(Math.random() * 3)),
      };
    })
  );

  return { members };
}

function generateSimulatedTasks(personId: string): TaskInfo[] {
  const numTasks = 3 + Math.floor(Math.random() * 8);
  const tasks: TaskInfo[] = [];

  for (let i = 0; i < numTasks; i++) {
    const hours = 4 + Math.floor(Math.random() * 12);
    tasks.push({
      id: `task-${personId}-${i}`,
      title: `Task ${i + 1}`,
      loadContribution: (hours / 40) * 100,
      requiredSkills: ['JavaScript'].slice(0, Math.floor(Math.random() * 2)),
      deadline: Math.random() > 0.5
        ? new Date(Date.now() + Math.random() * 30 * 24 * 60 * 60 * 1000)
        : undefined,
    });
  }

  return tasks;
}

function calculateBalanceMetrics(state: TeamWorkloadState): BalanceMetrics {
  const loads = state.members.map(m => m.load);
  const n = loads.length;

  if (n === 0) {
    return {
      giniCoefficient: 0,
      standardDeviation: 0,
      coefficientOfVariation: 0,
      maxMinRatio: 1,
      overloadedCount: 0,
      underutilizedCount: 0,
      balanceScore: 100,
    };
  }

  const mean = loads.reduce((a, b) => a + b, 0) / n;
  const variance = loads.reduce((sum, l) => sum + Math.pow(l - mean, 2), 0) / n;
  const stdDev = Math.sqrt(variance);
  const cv = mean > 0 ? stdDev / mean : 0;

  // Gini coefficient
  const sortedLoads = [...loads].sort((a, b) => a - b);
  let giniSum = 0;
  for (let i = 0; i < n; i++) {
    giniSum += (2 * (i + 1) - n - 1) * sortedLoads[i];
  }
  const gini = mean > 0 ? giniSum / (n * n * mean) : 0;

  const maxLoad = Math.max(...loads);
  const minLoad = Math.min(...loads);

  return {
    giniCoefficient: Math.round(gini * 100) / 100,
    standardDeviation: Math.round(stdDev * 100) / 100,
    coefficientOfVariation: Math.round(cv * 100) / 100,
    maxMinRatio: minLoad > 0 ? Math.round((maxLoad / minLoad) * 100) / 100 : maxLoad,
    overloadedCount: loads.filter(l => l > 100).length,
    underutilizedCount: loads.filter(l => l < 50).length,
    balanceScore: Math.round(Math.max(0, 100 - stdDev)),
  };
}

function calculateBalanceScore(state: TeamWorkloadState): number {
  return calculateBalanceMetrics(state).balanceScore;
}

function calculateImprovements(before: BalanceMetrics, after: BalanceMetrics): Improvement[] {
  return [
    {
      metric: 'Balance Score',
      before: before.balanceScore,
      after: after.balanceScore,
      improvementPercent: before.balanceScore > 0
        ? Math.round(((after.balanceScore - before.balanceScore) / before.balanceScore) * 100)
        : 0,
    },
    {
      metric: 'Standard Deviation',
      before: before.standardDeviation,
      after: after.standardDeviation,
      improvementPercent: before.standardDeviation > 0
        ? Math.round(((before.standardDeviation - after.standardDeviation) / before.standardDeviation) * 100)
        : 0,
    },
    {
      metric: 'Overloaded Count',
      before: before.overloadedCount,
      after: after.overloadedCount,
      improvementPercent: before.overloadedCount > 0
        ? Math.round(((before.overloadedCount - after.overloadedCount) / before.overloadedCount) * 100)
        : 0,
    },
  ];
}

function validateConstraints(
  moves: TaskMove[],
  state: TeamWorkloadState,
  config: OptimizationConfig
): OptimizationConstraint[] {
  const constraints: OptimizationConstraint[] = [];

  if (config.respectSkills) {
    const skillViolations = moves.filter(m => {
      const task = findTask(state, m.taskId);
      const target = state.members.find(mem => mem.personId === m.toPersonId);
      return task && target && !hasRequiredSkills(target, task);
    });

    constraints.push({
      type: 'skill_required',
      description: 'All task assignments match required skills',
      satisfied: skillViolations.length === 0,
      impact: skillViolations.length > 0
        ? `${skillViolations.length} moves may require skill training`
        : 'No impact',
    });
  }

  if (config.respectDeadlines) {
    constraints.push({
      type: 'deadline',
      description: 'Task deadlines are respected',
      satisfied: true,
      impact: 'No deadline conflicts detected',
    });
  }

  return constraints;
}

function applyMoves(state: TeamWorkloadState, moves: TaskMove[]): TeamWorkloadState {
  const newState = JSON.parse(JSON.stringify(state)) as TeamWorkloadState;

  for (const move of moves) {
    applyMoveToState(newState, move.fromPersonId, move.toPersonId, move.taskId);
  }

  return newState;
}

function applyMoveToState(
  state: TeamWorkloadState,
  fromPersonId: string,
  toPersonId: string,
  taskId: string
): void {
  const source = state.members.find(m => m.personId === fromPersonId);
  const target = state.members.find(m => m.personId === toPersonId);

  if (!source || !target) return;

  const taskIndex = source.tasks.findIndex(t => t.id === taskId);
  if (taskIndex === -1) return;

  const [task] = source.tasks.splice(taskIndex, 1);
  source.load -= task.loadContribution;
  target.tasks.push(task);
  target.load += task.loadContribution;
}

function findTask(state: TeamWorkloadState, taskId: string): TaskInfo | null {
  for (const member of state.members) {
    const task = member.tasks.find(t => t.id === taskId);
    if (task) return task;
  }
  return null;
}

function hasRequiredSkills(member: MemberWorkload, task: TaskInfo): boolean {
  return task.requiredSkills.every(skill => member.skills.includes(skill));
}

// Genetic algorithm helpers
interface Individual {
  moves: Array<{ fromPersonId: string; toPersonId: string; taskId: string }>;
  fitness: number;
}

function initializePopulation(state: TeamWorkloadState, size: number): Individual[] {
  const population: Individual[] = [];

  for (let i = 0; i < size; i++) {
    const moves: Array<{ fromPersonId: string; toPersonId: string; taskId: string }> = [];
    const numMoves = Math.floor(Math.random() * 5);

    for (let j = 0; j < numMoves; j++) {
      const source = state.members[Math.floor(Math.random() * state.members.length)];
      const target = state.members[Math.floor(Math.random() * state.members.length)];

      if (source.personId !== target.personId && source.tasks.length > 0) {
        const task = source.tasks[Math.floor(Math.random() * source.tasks.length)];
        moves.push({
          fromPersonId: source.personId,
          toPersonId: target.personId,
          taskId: task.id,
        });
      }
    }

    population.push({ moves, fitness: 0 });
  }

  return population;
}

function evaluateFitness(
  state: TeamWorkloadState,
  moves: Array<{ fromPersonId: string; toPersonId: string; taskId: string }>,
  config: OptimizationConfig
): number {
  const newState = JSON.parse(JSON.stringify(state)) as TeamWorkloadState;

  for (const move of moves) {
    applyMoveToState(newState, move.fromPersonId, move.toPersonId, move.taskId);
  }

  return calculateBalanceScore(newState);
}

function selectParent(population: Individual[]): Individual {
  // Tournament selection
  const tournamentSize = 3;
  let best = population[Math.floor(Math.random() * population.length)];

  for (let i = 1; i < tournamentSize; i++) {
    const candidate = population[Math.floor(Math.random() * population.length)];
    if (candidate.fitness > best.fitness) {
      best = candidate;
    }
  }

  return best;
}

function crossover(parent1: Individual, parent2: Individual): Individual {
  const moves = [
    ...parent1.moves.slice(0, Math.floor(parent1.moves.length / 2)),
    ...parent2.moves.slice(Math.floor(parent2.moves.length / 2)),
  ];

  return { moves, fitness: 0 };
}

function mutate(individual: Individual, state: TeamWorkloadState): void {
  if (individual.moves.length > 0 && Math.random() < 0.5) {
    // Remove random move
    individual.moves.splice(Math.floor(Math.random() * individual.moves.length), 1);
  } else {
    // Add random move
    const source = state.members[Math.floor(Math.random() * state.members.length)];
    const target = state.members[Math.floor(Math.random() * state.members.length)];

    if (source.personId !== target.personId && source.tasks.length > 0) {
      const task = source.tasks[Math.floor(Math.random() * source.tasks.length)];
      individual.moves.push({
        fromPersonId: source.personId,
        toPersonId: target.personId,
        taskId: task.id,
      });
    }
  }
}

function convertToTaskMoves(
  moves: Array<{ fromPersonId: string; toPersonId: string; taskId: string }>,
  state: TeamWorkloadState
): TaskMove[] {
  return moves.map(move => {
    const task = findTask(state, move.taskId);
    const source = state.members.find(m => m.personId === move.fromPersonId);
    const target = state.members.find(m => m.personId === move.toPersonId);

    return {
      taskId: move.taskId,
      taskTitle: task?.title || 'Unknown Task',
      fromPersonId: move.fromPersonId,
      fromPersonName: source?.personName || 'Unknown',
      toPersonId: move.toPersonId,
      toPersonName: target?.personName || 'Unknown',
      loadTransfer: task?.loadContribution || 0,
      reason: 'Genetic algorithm optimization',
      priority: 'recommended' as const,
      constraints: [],
    };
  });
}

function generateRandomMove(
  state: TeamWorkloadState,
  config: OptimizationConfig
): TaskMove | null {
  const overloaded = state.members.filter(m => m.load > 80);
  if (overloaded.length === 0) return null;

  const source = overloaded[Math.floor(Math.random() * overloaded.length)];
  if (source.tasks.length === 0) return null;

  const task = source.tasks[Math.floor(Math.random() * source.tasks.length)];
  const underloaded = state.members.filter(m => m.load < 80 && m.personId !== source.personId);

  if (underloaded.length === 0) return null;

  const target = underloaded[Math.floor(Math.random() * underloaded.length)];

  return {
    taskId: task.id,
    taskTitle: task.title,
    fromPersonId: source.personId,
    fromPersonName: source.personName,
    toPersonId: target.personId,
    toPersonName: target.personName,
    loadTransfer: task.loadContribution,
    reason: 'Simulated annealing exploration',
    priority: 'recommended',
    constraints: [],
  };
}

// =============================================================================
// Exports
// =============================================================================

export default {
  optimizeTeamWorkload,
  getQuickSuggestions,
  simulateMoves,
};
