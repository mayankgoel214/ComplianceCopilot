/**
 * The document the public demo analyses.
 *
 * Fixed rather than user-supplied, for two reasons. It bounds what the demo can
 * be made to spend, since the prompt size is constant. And it is written to
 * contain real, findable problems — a foreign national with access to
 * export-controlled data, credentials in source, unencrypted transfer of
 * clinical records, paper consent for minors — so that a visitor can check the
 * output against the input rather than taking the scores on trust.
 */

export const DEMO_PROJECT_DESCRIPTION = `
A university research platform supporting a multi-site clinical study. It stores
student academic records alongside health measurements collected from
participants, some of whom are under 18. Data is shared with partner
institutions in Germany and France, and a subset of the analysis code is
export-controlled.
`.trim();

export const DEMO_DOCUMENT = `
DATA MANAGEMENT PLAN — Project AETHER

1. Systems and storage
Student identifiers, enrolment records and course grades are held in a
PostgreSQL database on university infrastructure. Clinical measurements
collected during the study are stored in the same database, in adjacent tables,
with no separation of duties between the research and registrar schemas.
Nightly backups are written to an S3 bucket. The bucket policy has not been
reviewed since the project began.

2. Access
Access is granted to researchers on request by email to the PI. There is no
formal review step and no periodic recertification. Twelve accounts currently
have read access to the clinical tables; four of those belong to students who
have since completed the project. Database credentials are stored in a shared
configuration file committed to the project repository.

3. Transfers
Data is transferred to partner institutions in Germany and France over SFTP on
a weekly schedule. Transfers are not encrypted at rest on the receiving side,
and no data processing agreement is currently in place with either partner.

4. Participants
Participants under 18 are enrolled with parental consent collected on paper and
filed in the PI's office. Consent records are not linked to the participant
identifiers in the database, so a withdrawal request cannot currently be
traced to the rows it affects.

5. Analysis code
Part of the anomaly-detection code is subject to export control. One member of
the analysis team is a foreign national and has commit access to the full
repository, including the controlled modules.

6. Logging
Application logs record full request bodies for debugging, including
participant identifiers and measurement values. Logs are retained
indefinitely.
`.trim();
