/**
 * CarePlan mapper: app `CarePlan` → FHIR R4 `CarePlan` (subtask 6).
 *
 * Goals become `CarePlan.goal` entries (description + mapped status);
 * collaboration notes become `CarePlan.note` annotations (author + time).
 */
import type { CarePlan as DomainCarePlan, CareGoalStatus } from '../../features/home-health/care-plan.store';
import type {
  CarePlan as FhirCarePlan,
  Reference,
  CarePlanGoal,
  Annotation,
} from './fhir.types';

function instantISO(ms: number): string {
  return new Date(ms).toISOString();
}

/** App goal status → FHIR CarePlanGoal status. */
function mapGoalStatus(status: CareGoalStatus): string {
  switch (status) {
    case 'open':
      return 'planned';
    case 'in-progress':
      return 'in-progress';
    case 'done':
      return 'achieved';
    default: {
      const exhaustive: never = status;
      throw new Error(`Unknown care goal status: ${exhaustive}`);
    }
  }
}

/** Map an app care-plan note to a FHIR `Annotation`. */
function toAnnotation(note: { authorName: string; text: string; atMs: number }): Annotation {
  return {
    authorString: note.authorName,
    time: new Date(note.atMs).toISOString(),
    text: note.text,
  };
}

/**
 * Map the app's `CarePlan` to a FHIR `CarePlan` resource.
 *
 * @throws when the input is missing an id (subtask 16-equivalent).
 */
export function toCarePlan(
  plan: DomainCarePlan,
  subject: Reference,
  nowMs: number = Date.now()
): FhirCarePlan {
  if (!plan || !plan.id) {
    throw new Error('Cannot map CarePlan to FHIR CarePlan: missing id.');
  }

  const goals: CarePlanGoal[] = (plan.goals ?? []).map((g) => ({
    description: g.text,
    status: mapGoalStatus(g.status),
  }));

  const notes: Annotation[] = (plan.notes ?? []).map(toAnnotation);

  const title = `Shared care plan — ${plan.clientName}`;
  // The most recent note summarises the current plan state.
  const latestNote = notes.slice().sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))[0];
  const description = latestNote?.text ?? '';

  const resource: FhirCarePlan = {
    resourceType: 'CarePlan',
    id: `cp-${plan.id}`,
    status: 'active',
    intent: 'plan',
    title,
    subject,
    description,
    period: { start: new Date(plan.updatedAtMs).toISOString(), end: undefined },
    created: new Date(plan.updatedAtMs).toISOString(),
    goal: goals.length ? goals : undefined,
    note: notes.length ? notes : undefined,
    meta: { lastUpdated: new Date(nowMs).toISOString() },
  };

  return resource;
}
