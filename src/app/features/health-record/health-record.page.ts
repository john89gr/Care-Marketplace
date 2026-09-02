import { Component } from '@angular/core';

@Component({
  selector: 'app-health-record',
  standalone: true,
  imports: [],
  template: `
    <section class="health-record">
      <h1>Personal Health Record</h1>
      <p>Vitals logging, smart medication reminders and FHIR export arrive in Phase 3 (PLAN.md §5).</p>
    </section>
  `,
})
export class HealthRecordPage {}
