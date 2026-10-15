// Labels for EI progress reports (the "ei" feature, PedsDesk;
// src/ProgressReports.jsx). The PDF is laid out like NYC's Provider Progress
// Note (9/2024) in src/eiFormsPdf.js.

export const RATING_LABEL = { none: 'No progress', emerging: 'Emerging skills', achieved: 'Achieved' };
export const COMM_LABEL = {
  communication_book: 'Communication book', family_activity_sheet: 'Family activity sheet', emails: 'Emails (with written consent)',
  phone_calls: 'Phone calls', session_notes: 'Session notes shared', other: 'Other',
};
export const DELIVERY_LABEL = { in_person: 'In-person', telehealth: 'Telehealth', hybrid: 'Hybrid' };
export const TYPE_LABEL = { 6: '6-month', 12: '12-month', amendment: 'Amendment' };
// NYC's wording (Provider Progress Note 9/2024).
export const QUESTIONS = {
  q2: '2. List the IFSP outcomes that you did not address in this service authorization period and explain why.',
  q3: '3. Describe the learning activities (technique/strategies/methods/routine activities) that were successful for the child/family and specify the IFSP outcomes and developmental steps (by number/letter) related to these activities.',
  q4: '4. What changes were made to the learning activities (coaching techniques/strategies/methods/routine activities) when they were ineffective for the family/caregiver? Were these modifications successful? If not, why not? Please address each IFSP outcome as applicable.',
  q5: '5. Describe all collaborative efforts made to address the IFSP outcomes (e.g., interaction with other service provider(s), members of the EI team, child care staff, community resources, and/or medical providers (with written parent consent)). Please include the family members/caregivers you have been working with.',
  q6: '6. Based on your on-going assessment of the child, what is the overall progress in this child’s functional abilities since the last IFSP meeting or Progress Report? How was progress determined (e.g. standardized instrument, checklist, non-standardized assessments, observation & informed clinical opinion)?',
  q7: '7. What skills will you be working on in the next 6 months?',
};
