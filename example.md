Project AETHER WATCH: Compliance Assessment Dossier
Part 1: Project Scoping and Contractual Basis
1.1 Research Grant Proposal
Format: PDF Document
Cover Page
Project Title: Project AETHER WATCH: AI-Driven Anomaly Detection for Enhanced Space Domain Awareness
Submitting Institution: Purdue University, Advanced Signal Processing Lab
Principal Investigator: Dr. Eleanor Vance
Co-Investigators: Dr. Samuel Carter
Submission Date: October 1, 2025
Proposed Funder: Defense Technical Information Center (DTIC), Information Analysis Center (IAC) Program

1.0 Executive Summary
Project AETHER WATCH proposes the development of a novel artificial intelligence/machine learning (AI/ML) framework to enhance Space Domain Awareness (SDA). Our primary objective is to create and validate algorithms capable of analyzing satellite telemetry data in near-real-time to identify Cyber-Suspicious Indicators (CSI). By detecting subtle deviations in satellite behavior indicative of potential cyber threats, this project will provide a critical early-warning capability, contributing directly to the security and resilience of national space assets. This proposal seeks funding to support a 24-month research and development effort, leveraging the unique expertise of Purdue University's Advanced Signal Processing Lab. This work is proposed as a subcontract under the DTIC IAC's multiple-award contract for research and development, aligning with its mission to provide technical expertise in critical defense areas. The partnership builds upon Purdue's established relationship with industry leaders in national security, including a recent initiative with AMERICAN SYSTEMS to advance space security.  
2.0 Technical Approach
The core of Project AETHER WATCH is a hybrid AI model combining recurrent neural networks (RNNs) for time-series analysis of telemetry streams with a graph neural network (GNN) to model inter-satellite communications and relationships. The methodology involves three phases:
Phase 1 (Months 1-6): Data Ingestion and Model Scaffolding. We will develop a robust data pipeline to process the government-furnished dataset. The initial AI model architecture will be constructed.
Phase 2 (Months 7-18): Algorithm Training and Refinement. The model will be trained on the provided dataset to establish a baseline of normal satellite behavior. We will then introduce simulated anomaly data to train the CSI detection capabilities.
Phase 3 (Months 19-24): Validation and Reporting. The model's performance will be rigorously tested and validated. Final reports and a prototype software deliverable will be prepared.
3.0 Data Management
The project will utilize a significant dataset of proprietary satellite telemetry provided by the Department of Defense (DoD). This dataset is designated as Controlled Unclassified Information (CUI) and contains sensitive operational parameters. All project data, including the CUI dataset, intermediate processing files, and resulting models, will be stored securely on the university's central cloud infrastructure, which utilizes a standard commercial AWS tenant. Access will be managed by the university's IT services according to standard research protocols.
4.0 Collaboration and Peer Review
To ensure the scientific rigor of our algorithmic development, we have established a collaboration with Dr. Alistair Smith, a leading expert in statistical signal processing at the University of Manchester, UK. Dr. Smith will assist in the validation of our core algorithms, providing an independent peer review of our methodology and results. This international collaboration is vital for achieving state-of-the-art performance.
5.0 Personnel
The project team comprises faculty, postdoctoral researchers, and graduate students with extensive experience in AI/ML and satellite systems.
Table 1: Project Personnel Roster
Name
Role
Affiliation
Citizenship
U.S. Person Status (Y/N)
Dr. Eleanor Vance
Principal Investigator
Purdue University
USA
Y
Dr. Samuel Carter
Co-Investigator
Purdue University
USA
Y
Dr. Maria Flores
Postdoctoral Researcher
Purdue University
USA
Y
John Miller
Postdoctoral Researcher
Purdue University
USA
Y
Li Chen
Ph.D. Student
Purdue University
People's Republic of China
N

Export to Sheets
6.0 Budget and Justification
(Detailed budget table follows, including line items for personnel salaries, equipment, and overhead. A notable line item is included for "Cloud Computing Resources - $25,000" with the justification mentioning standard university-provisioned AWS services.)
7.0 Expected Outcomes
Project AETHER WATCH will deliver:
A validated AI/ML framework for detecting Cyber-Suspicious Indicators in satellite telemetry.
A final technical report detailing the model architecture, training methodology, and performance metrics.
A prototype software package containing the developed algorithms.
This project's success will represent a significant advancement in Space Domain Awareness, directly supporting the national security mission of the Department of Defense.

1.2 Statement of Work (SOW) from AMERICAN SYSTEMS
Format: DOCX Document
Statement of Work Between AMERICAN SYSTEMS CORPORATION 14151 Park Meadow Dr, Chantilly, VA 20151 and Purdue University, Advanced Signal Processing Lab
1.0 Project Title: Project AETHER WATCH
2.0 Period of Performance: November 1, 2025 – October 31, 2027
3.0 Background: AMERICAN SYSTEMS, in its capacity as a prime contractor supporting the Department of Defense (DoD), requires advanced research and development in the area of Space Domain Awareness (SDA). This Statement of Work (SOW) establishes the terms for a subcontract with Purdue University to develop novel AI/ML algorithms for this purpose.
4.0 Scope of Work: The Subcontractor (Purdue University) shall perform the necessary research and development to design, build, and validate an AI/ML framework capable of identifying Cyber-Suspicious Indicators (CSI) from government-furnished satellite telemetry data.
5.0 Deliverables:
Quarterly Progress Reports
Monthly Technical Interchange Meetings
Final Technical Report
Prototype Software and Source Code
6.0 Security and Compliance Requirements:
6.1 Data Handling: This project involves the processing, storing, and transmitting of Controlled Unclassified Information (CUI) and ITAR-controlled technical data. The data and any derivative products (including algorithms and source code) are subject to U.S. export control laws.
6.2 Compliance Frameworks: The Subcontractor must adhere to the following regulations and standards for the entire period of performance: * DFARS 252.204-7012: Safeguarding Covered Defense Information and Cyber Incident Reporting. The Subcontractor's information systems must comply with the security requirements specified in NIST SP 800-171. * Cybersecurity Maturity Model Certification (CMMC) Level 2: The Subcontractor must achieve and maintain CMMC Level 2 certification for all information systems that process, store, or transmit CUI in connection with this project. This requirement reflects AMERICAN SYSTEMS' own commitment to the highest security standards, as demonstrated by its own CMMC Level 2 certification.  
* International Traffic in Arms Regulations (ITAR): The algorithms, source code, and technical data developed under this SOW are considered "defense articles" and "technical data" as defined under the United States Munitions List (USML), Category XV (Spacecraft and Related Articles). Transfer of this technical data to any foreign person or entity, whether in the U.S. or abroad, is strictly prohibited without an explicit license from the U.S. Department of State.  
6.3 Personnel: All personnel with access to ITAR-controlled technical data must be U.S. Persons as defined by ITAR unless a specific exemption or license is obtained.
7.0 Government Furnished Information (GFI): A dataset of satellite telemetry, classified as CUI, will be provided by the government customer via a secure transfer method designated by AMERICAN SYSTEMS.

1.3 Meeting Minutes - Project Kickoff
Format: TXT Document
PROJECT KICKOFF MEETING NOTES
Project: AETHER WATCH Date: November 5, 2025 Attendees: Dr. Eleanor Vance (Purdue), Dr. Samuel Carter (Purdue), Li Chen (Purdue), Mark Johnson (AMERICAN SYSTEMS PM)
------------------------------------------------------------------
DISCUSSION TOPICS:
1. Introductions and Project Overview - Mark J. welcomed the Purdue team. - Dr. Vance gave an overview of the lab's capabilities and excitement for the project. - Reviewed high-level goals from the SOW.
2. Data Transfer Plan - Mark J. confirmed the CUI dataset is ready for transfer. - Purdue team confirmed their AWS environment is provisioned and ready to receive the data. - Mark J. to initiate secure transfer by EOW.
3. Initial Technical Tasks - The team discussed the first steps for Phase 1. - Focus will be on data preprocessing and building the initial model structure. - Dr. Vance noted that the core RSO trajectory prediction module is the most critical first component.
4. Collaboration with U. Manchester - Dr. Vance mentioned the plan to have Dr. Smith at the University of Manchester review the algorithms for validation purposes. - Mark J. asked for Dr. Smith's contact info to keep in the project stakeholder list.
ACTION ITEMS:
AI-1: Li Chen to begin developing the core RSO trajectory prediction module using the initial CUI dataset once it is received. (Owner: L. Chen, Due: Dec 15, 2025)
AI-2: Mark Johnson to initiate secure transfer of the CUI dataset to Purdue's designated endpoint. (Owner: M. Johnson, Due: Nov 8, 2025)
AI-3: Purdue team to share preliminary algorithm source code with Dr. Smith (U. Manchester) via university GitHub for peer review by end of Q1 2026. (Owner: E. Vance, Due: Mar 31, 2026)
AI-4: Schedule next technical interchange meeting for first week of December. (Owner: M. Johnson)
------------------------------------------------------------------ END OF NOTES

Part 2: Technical and Implementation Artifacts
2.1 System Architecture Diagram
Format: PNG Image
(A flowchart diagram is presented. It contains the following elements and connections, clearly labeled in plain text.)
A box labeled "DoD SFTP Server (GFI - CUI Data)" is on the far left.
An arrow points from the SFTP server to a box labeled "Purdue University AWS Tenant (Commercial S3 Bucket)".
This S3 bucket is inside a larger dotted-line box labeled "Data Processing Environment".
Inside this larger box, an arrow points from the S3 bucket to a box labeled "EC2 Instance - AI/ML Model Training".
An arrow points from the EC2 instance to another box inside the environment labeled "PostgreSQL DB (Model Results)".
A final arrow points from the "Data Processing Environment" box outwards to a box on the far right labeled "External API Endpoint: U. Manchester Validation Service".
The diagram notably lacks any icons or labels for firewalls, encryption gateways, or access control modules between the components, especially around the S3 bucket and the external API connection.

2.2 Code Repository Snippets
Format: Two.py files
File 1: data_processor.py
File 2: api_client.py

2.3 Data Management Plan (DMP) - Incomplete Draft
Format: PDF Document
Purdue University - Research Data Management Plan
Project Title: Project AETHER WATCH
Principal Investigator: Dr. Eleanor Vance
1. Data Description: The primary data for this project consists of satellite telemetry records provided by the Department of Defense. This data is classified as Controlled Unclassified Information (CUI). The data includes orbital parameters, subsystem health status, and communications logs. Secondary data will be generated by the project, including trained AI/ML models, model outputs, and performance metrics. This generated data is also considered CUI and ITAR-controlled.
2. Data Storage and Preservation: All research data will be stored on the Purdue University central cloud storage system, provisioned through AWS. Data will be backed up nightly according to standard university IT procedures. The project anticipates generating approximately 5 TB of data over its 24-month lifecycle.
3. Access and Security: Access to the research data will be limited to project personnel as listed in the grant proposal. The Principal Investigator will be responsible for authorizing access. User authentication is managed via the university's single sign-on (SSO) system.
4. Data Sharing: Results of the research will be shared with the project sponsor, AMERICAN SYSTEMS, through contractually obligated deliverables. Public dissemination of the data or results is prohibited due to the sensitive nature of the information.
(NOTE: The document ends here. It is visibly incomplete and lacks critical sections required for handling CUI, such as: Incident Response Plan, Media Sanitization and Disposal, System Security Plan (SSP) reference, Audit and Accountability Measures, and specific technical controls for data protection.)

Part 3: Internal Policies and Communications
3.1 University Information Security Policy
Format: PDF Document
Purdue University - Policy IT-SEC-01
Title: Information Security and Data Classification
Effective Date: July 1, 2023
1.0 Purpose This policy establishes a framework for classifying and protecting the university's information assets to manage risk and comply with applicable laws and regulations.
2.0 Data Classification Levels All university data must be classified into one of the following three levels:
Level 1: Public Data. Information intended for public disclosure.
Level 2: Internal Data. Information not intended for the public but which can be shared widely within the university community.
Level 3: Restricted Data. Highly sensitive information protected by law, regulation, or university policy. Examples include student records (FERPA), health information (HIPAA), and personally identifiable information (PII). Access to Restricted Data must be limited to individuals with a legitimate need-to-know.
3.0 Security Requirements
3.1 Access Control: Access to university information systems is granted based on the principle of least privilege.
3.2 Password Policy: All user accounts must have a password that is at least 12 characters long and includes a mix of upper-case letters, lower-case letters, numbers, and symbols. Passwords must be changed every 180 days.
3.3 Data Encryption: All laptops and mobile devices used to store or access Level 3 (Restricted) data must have full-disk encryption enabled.
4.0 Policy Enforcement Violations of this policy may result in disciplinary action, up to and including termination of employment or expulsion.
(NOTE: This policy is a generic university document. It lacks any mention of CUI, ITAR, NIST SP 800-171, or CMMC. It does not mandate multifactor authentication (MFA), continuous monitoring, audit logging, or the creation of a System Security Plan (SSP), all of which are fundamental requirements for CMMC Level 2.)

3.2 Email Correspondence Chain
Format: TXT Document
From: Eleanor Vance <evance@purdue.edu> To: Li Chen <chen3412@purdue.edu> Cc: Samuel Carter <scarter@purdue.edu> Date: February 12, 2026 Subject: Code for Dr. Smith
Hi Li,
Hope you're having a productive week. I just got off a call with Alistair Smith in the UK, and he's eager to take a look at our progress on the trajectory prediction module.
Can you send me the latest version of the trajectory prediction source code? I want to forward it to Dr. Smith in the UK for his opinion before our next review with AMERICAN SYSTEMS.
Thanks, Eleanor
---
From: Li Chen <chen3412@purdue.edu> To: Eleanor Vance <evance@purdue.edu> Cc: Samuel Carter <scarter@purdue.edu> Date: February 12, 2026 Subject: Re: Code for Dr. Smith
Hi Dr. Vance,
Of course. Attached is the Python script with the latest model.
I've also included the test dataset we used for the last run so he can replicate our results directly. It's a small subset of the main CUI data file, about 100MB.
Let me know if he has any questions.
Best, Li
Attachments: trajectory_predictor_v1.3.py, test_data_subset_cui.csv

Part 4: Reference Frameworks for RAG Enhancement
4.1 CMMC Level 2 Control Checklist
Format: Markdown Document
CMMC Level 2 Controls (Based on NIST SP 800-171 Rev 2)
Access Control (AC)
3.1.1: Limit information system access to authorized users.
3.1.2: Limit information system access to the types of transactions and functions that authorized users are permitted to execute.
3.1.3: Control the flow of CUI in accordance with authorized authorizations.
3.1.5: Employ the principle of least privilege, including for specific security functions and privileged accounts.
3.5.3: Use multifactor authentication for local and network access to privileged accounts and for network access to non-privileged accounts.
Audit and Accountability (AU)
3.3.1: Create and retain information system audit records and reports to the extent needed to enable the monitoring, analysis, investigation, and reporting of unlawful, unauthorized, or inappropriate information system activity.
3.3.2: Ensure that the actions of individual information system users can be uniquely traced to those users so they can be held accountable for their actions.
Configuration Management (CM)
3.4.1: Establish and maintain baseline configurations and inventories of organizational information systems.
3.4.2: Establish and enforce security configuration settings for information technology products employed in information systems.
Incident Response (IR)
3.6.1: Establish an operational incident-handling capability for organizational information systems that includes adequate preparation, detection, analysis, containment, recovery, and user response activities.
3.6.2: Track, document, and report incidents to appropriate officials and/or authorities both internal and external to the organization.
System and Communications Protection (SC)
3.13.1: Monitor, control, and protect organizational communications at the external boundaries and key internal boundaries of the information systems.
3.13.8: Implement cryptographic mechanisms to prevent unauthorized disclosure of CUI during transmission unless otherwise protected by an alternative physical protection measure.
3.13.11: Employ FIPS-validated cryptography when used to protect the confidentiality of CUI.
System and Information Integrity (SI)
3.14.1: Identify, report, and correct information and information system flaws in a timely manner.
3.14.2: Provide protection from malicious code at appropriate locations within organizational information systems.
(This file would continue, listing all 110 controls from the 14 families of NIST SP 800-171.)

4.2 ITAR "Deemed Export" Rule Summary
Format: Markdown Document
ITAR Compliance Brief: The "Deemed Export" Rule
What is ITAR?
The International Traffic in Arms Regulations (ITAR) is a set of U.S. government regulations that control the export of defense-related articles and services. Its goal is to safeguard U.S. national security and further U.S. foreign policy objectives. Items controlled by ITAR are found on the United States Munitions List (USML).  
What is an "Export"?
Under ITAR, an "export" is not just shipping a physical item overseas. It also includes releasing or otherwise transferring "technical data" to a foreign person, whether in the United States or abroad.
The "Deemed Export" Rule
The core of the rule is simple: releasing controlled technical data to a foreign person within the United States is "deemed" to be an export to that person's country or countries of citizenship.
Technical Data: This includes information required for the design, development, production, manufacture, assembly, operation, repair, testing, maintenance, or modification of defense articles. This can be blueprints, formulas, source code, or engineering specifications.
Foreign Person: A foreign person is anyone who is not a U.S. citizen, not a lawful permanent resident (i.e., not a "Green Card" holder), and not a protected individual (e.g., a refugee or person with asylum).
Release: A "release" of technical data can happen through visual inspection, oral communication, or by providing access to a system or file containing the data.
Why It Matters for Project AETHER WATCH
The algorithms, source code, and technical specifications developed under the project are defined as USML Category XV articles.
Providing a non-U.S. Person, such as a foreign national graduate student, with access to this technical data constitutes a deemed export.
This action requires an export license from the Department of State's Directorate of Defense Trade Controls (DDTC) before access is granted.
Failure to obtain a license before the release occurs is a serious violation of federal law, carrying severe civil and criminal penalties.
Key Takeaway
You cannot provide a foreign national team member with access to ITAR-controlled source code or technical data without first securing a proper export license. The location of the person (i.e., on campus in the U.S.) does not matter.




UNCLASSIFIED // CUI – ITAR-CONTROLLED (Sample Test Data) 
Project AETHER WATCH: Compliance Assessment Dossier 
Testing Data & Control Validation Pack 
(Prepared for AMERICAN SYSTEMS – Demo) 
Submitting Institution: Purdue University, Advanced Signal Processing Lab Principal Investigator: Dr. Eleanor Vance | Co-I: Dr. Samuel Carter 
Prepared: September 28, 2025 
Compliance Scope: DFARS 252.204-7012 • NIST SP 800-171 (CMMC Level 2) • ITAR (USML Cat XV)
Distribution Statement: For Official Use in Demo Only • Do not use on real projects 
UNCLASSIFIED // CUI – ITAR-CONTROLLED (Sample Test Data) 
A. Purpose & Scope 
Objective. Provide comprehensive, realistic test data and procedures to validate compliance and risk controls for Project AETHER WATCH under the AMERICAN SYSTEMS SOW. This pack enables auditors and reviewers to verify that CUI and ITAR-controlled technical data are protected and that key CMMC Level 2 practices are implemented and tested. 
In-Scope Systems. Purdue AWS Tenant (Commercial) including S3 (CUI repository), EC2 (model training), PostgreSQL (model results), secure SFTP ingress, restricted outbound API client. University identity and access management (SSO/MFA). Code repositories for data_processor.py and api_client.py in restricted projects. 
Out-of-Scope. Non-project university systems; personal devices not enrolled in endpoint protection; unmanaged cloud services. 
B. Compliance Obligations (Reference) 
• DFARS 252.204-7012: Safeguard CUI; cyber incident reporting and malware submission timelines. 
• NIST SP 800-171 / CMMC Level 2: 110 controls across 14 families; focus areas include AC, AU, CM, IR, SC, SI, IA. 
• ITAR (USML Cat XV): Technical data and source code may be controlled; 'deemed export' restrictions apply. U.S. Persons-only access unless licensed. 
NOTE: This is sample testing data for a demo environment; verify with legal/compliance teams for production use. 
C. Test Environment Summary 
Data Flow Overview: DoD SFTP (GFI-CUI) → S3 (private, SSE-KMS) → EC2 (FIPS-validated TLS) → PostgreSQL (encrypted) → OPTIONAL: External validation service (blocked by default; enabled only with approved export license). 
D. Personnel & U.S. Person Verification 
Name Role Affiliation Citizenship U.S. Person (Y/N) 

Dr. Eleanor Vance 
Dr. Samuel Carter 
PI Purdue University 
Co-I Purdue University 
USA Y USA Y

Distribution Statement: For Official Use in Demo Only • Do not use on real projects 
UNCLASSIFIED // CUI – ITAR-CONTROLLED (Sample Test Data) 

Dr. Maria Flores 
Postdoc Purdue University 
USA Y 

John Miller Postdoc Purdue University 
Li Chen Ph.D. Student Purdue University 
USA Y PRC N 

Constraint: ITAR-controlled technical data and code MUST NOT be accessible by non–U.S. Persons (e.g., Li Chen) absent an export license.
Distribution Statement: For Official Use in Demo Only • Do not use on real projects 
UNCLASSIFIED // CUI – ITAR-CONTROLLED (Sample Test Data) 
E. Master Test Plan 
Test Objectives. Validate that safeguards for CUI/ITAR are effective; confirm traceability to CMMC L2; surface gaps for the POA&M. 
E.1 Access Control & Identity 

Tes t ID 
Objective Pre 
Conditions 
Procedure Expected Result 
Evidence to Capture 
Control Mappin g 

AC 01 
AC 02 
AC 03 
AC 04 
Enforce MFA for all users 
accessing CUI 
systems via SSO 
Verify 
least 
privilege IAM roles for S3 CUI bucket 
Block 
access for non–U.S. persons to ITAR 
repositor y 
Enforce time 
bound 
privileged access 
(PAM/JIT ) 
Test user 
enrolled in SSO; CUI 
tagged AWS accounts 
configured 
Role: 
AETHER 
Analyst 
ReadOnly; 
Bucket policy with deny public 
User 'Li Chen' in directory; attribute 
US_Person=N o 
Admin role requires 
approval; 
ticket open with expiry 
Attempt console and CLI login 
without second factor; then with MFA 
Attempt PutObject and 
ListBucketVersion s using read-only role 
Attempt to access ITAR code repo and EC2 bastion 
Assume admin before approval and after expiry 
Access 
denied 
without MFA; 
permitte d with 
MFA 
PutObject denied; 
read/list allowed per policy 
Access 
denied; 
event 
generates alert 
Denied 
before 
approval and after expiry; 
allowed during 
window 
Login 
audit logs, screensho t of MFA prompt, 
IAM policy 
IAM policy JSON, 
access 
denied 
logs, test outputs 
Access 
denial 
logs, SIEM alert, 
directory attribute 
PAM 
approvals, CloudTrail assume role 
events 
CMMC 
AC, IA; 3.5.3 
MFA 
CMMC 
AC 3.1.1, 3.1.5 
ITAR 
deemed export; AC 3.1.3 
AC 3.1.5, AU 3.3.2

Distribution Statement: For Official Use in Demo Only • Do not use on real projects 
UNCLASSIFIED // CUI – ITAR-CONTROLLED (Sample Test Data) 
E.2 System & Communications Protection 

Test ID Objective Pre Conditions 
Procedure Expected Result 
Evidence to Capture 
Control Mapping 

SC-01 Verify TLS 1.2+ with 
FIPS 
validated 
ciphers in 
transit 
SC-02 Validate S3 SSE 
KMS with 
customer 
managed 
keys 
(CMK) 
SC-03 Restrict egress to 
external 
validation 
service by 
default 
SC-04 Verify SSH/SFTP 
hardening 
for GFI 
transfer 
Load 
balancer 
and SFTP configured 
Bucket 
policy 
requires 
aws:kms 
and 
specific key ID 
VPC egress ACL denies; route to U. Manchester disabled 
SFTP host key pinned; user 
allowlist; IP 
restricted 
Run TLS 
scan; 
capture 
cipher 
suites; 
MITM 
negative 
test 
Upload 
object 
without 
encryption header; 
attempt 
read 
Attempt 
HTTPS call from 
api_client.py to external URL 
Connect 
with wrong key and 
from non allowlisted IP 
Only FIPS validated suites; 
downgrade attacks 
blocked 
Upload 
denied; 
only KMS encrypted objects 
accepted 
Connection blocked; 
alert 
generated 
Connection refused; 
alarms 
raised 
TLS scan report, 
config 
export 
Access 
denied 
logs, 
bucket 
policy, 
CMK 
policy 
VPC flow logs, 
firewall 
rules, 
SIEM alert 
SFTP logs, IDS alerts, config 
SC 3.13.8, 3.13.11 
SC 
3.13.11, MP 3.8.x 
SC 3.13.1; ITAR 
export 
control 
SC 3.13.1; IA 3.5.x 

E.3 Audit & Accountability 

Tes t ID 
Objective Pre 
Conditions 
Procedure Expected Result 
Evidence to Capture Control Mappin 
g 

AU 01 
Ensure unique user 
CloudTrail , OS logs, DB audit 
Perform read/writ e in S3 
Events 
mapped to user 
SIEM search export, log samples 
AU 
3.3.1,

Distribution Statement: For Official Use in Demo Only • Do not use on real projects 
UNCLASSIFIED // CUI – ITAR-CONTROLLED (Sample Test Data) 

AU 02 
traceabilit y in logs 
Protect log integrity and clock sync 
enabled 
and 
centralize d 
Immutabl e storage, NTP 
configured 
and DB 
under test user 
Attempt to modify logs; 
check 
time skew alarms 
identity 
with time, source, 
action 
Modificatio n 
prevented; alarms for drift 
WORM/immutabilit y config, alarm 
screenshots 
3.3.2 
AU 
3.3.x, SI 3.14.1 

E.4 Incident Response 
Test ID Objective Pre Conditions 
Procedure Expected Result 
Evidence to Capture 
Control Mapping 

IR-01 Tabletop exercise 
for CUI 
incident 
and DFARS 
reporting 
IR-02 Malware sample 
submission 
workflow 
IR plan 
defines 
roles, 
timelines, DIBNet 
reporting workflow 
Designated tooling and safe 
handling procedures 
Run 
tabletop; simulate 
CUI 
exfiltration; execute 
comms 
plan 
Simulate 
capture; 
package 
and submit per policy 
Team 
meets 72- hour 
reporting; artifacts 
prepared 
Submission traceable; no 
additional exposure 
After 
action 
report, 
timeline, draft 
report 
templates 
Ticket, 
submission receipt, 
hash 
values 
IR 3.6.1, 3.6.2; 
DFARS - 7012 
DFARS - 7012; IR 3.6.x 

E.5 Configuration Management Test ID Objective Pre Conditions 
Procedure Expected Result 
Evidence to 
Capture 
Control Mapping 

CM-01 Baseline configurations 
& CIS/DoD 
STIG 
Baseline images 
codified; drift 
detection 
Scan EC2 and DB against baseline 
No high 
findings; 
deviations documented 
Scan 
reports, baseline manifests 
CM 3.4.1, 3.4.2

Distribution Statement: For Official Use in Demo Only • Do not use on real projects 
UNCLASSIFIED // CUI – ITAR-CONTROLLED (Sample Test Data) 
alignment enabled 

CM-02 Change 
control with 
approvals and 
testing 
Change 
board 
defined; 
repo 
branch 
protections 
Submit 
infra 
change 
without approval; attempt merge to main 
Blocked; only 
approved changes deploy 
Change tickets, CI/CD logs 
CM 3.4.x 

E.6 System & Information Integrity 

Tes t ID 
Objective Pre Conditio 
ns 
Procedure Expected Result 
Evidence to 
Capture 
Control Mappin g 

SI 01 
SI 02 
Patch/vulnerabil ity remediation timelines 
Malware 
protection at endpoints/serve rs 
Scanner enabled; severity SLAs 
EDR 
deployed ; real 
time 
protectio n on 
Introduce known vulnerable AMI; observe 
remediation 
workflow 
Simulate EICAR test; observe 
detection/containm ent 
Patches within 
SLA; 
exceptio ns 
recorded 
Detectio n 
blocked; alert 
raised 
Vuln scan exports, tickets 
EDR 
console alert, 
hash 
quaranti ne logs 
SI 
3.14.1 
SI 
3.14.2 

E.7 Media Protection 
Test ID Objective Pre Conditions 
Procedure Expected Result 
Evidence to Capture 
Control Mapping 

MP-01 CUI media sanitization 
per NIST 
800-88 
Sanitization SOP; 
approved tools list 
Decommission volume; 
perform 
sanitize; verify 
Media 
sanitized or 
destroyed with 
certificate 
Sanitization logs, 
certificate 
MP 3.8.x

Distribution Statement: For Official Use in Demo Only • Do not use on real projects 
UNCLASSIFIED // CUI – ITAR-CONTROLLED (Sample Test Data) 
E.8 Data Management & Export Control 

Test ID 
Objective Pre 
Conditions 
Procedure Expected Result 
Evidence to 
Capture 
Control Mapping 

EX 01 
EX 02 
Prevent 
outbound 
sharing of ITAR 
technical 
data to 
foreign 
persons 
License 
gated 
collaboration with 
University of Manchester 
DLP rules, repo access lists, 
email/block policies 
Export 
license 
placeholder; network 
rules 
disabled by default 
Attempt to email/source control share to foreign 
domain/user 
Attempt API call without license; then enable per 
license 
window 
Action 
blocked; 
alert and ticket 
created 
Blocked 
without 
license; 
allowed 
during 
licensed 
window 
with 
monitoring 
Mail/DLP logs, 
SIEM 
alert, 
ticket 
License record, 
firewall change 
ticket, 
logs 
ITAR 
deemed 
export; AC 3.1.3; SC 
3.13.1 
ITAR 
compliance; SC 3.13.1

Distribution Statement: For Official Use in Demo Only • Do not use on real projects 
UNCLASSIFIED // CUI – ITAR-CONTROLLED (Sample Test Data) 
F. Sample Results Snapshot (Demo) 
Test ID Status Notes 
AC-01 Pass See evidence folder / tickets (demo) 
AC-02 Pass See evidence folder / tickets (demo) 
AC-03 Pass See evidence folder / tickets (demo) 
SC-03 Pass See evidence folder / tickets (demo) 
SC-04 Pass See evidence folder / tickets (demo) 
AU-02 Partial See evidence folder / tickets (demo) 
IR-01 Partial See evidence folder / tickets (demo) 
CM-01 Pass See evidence folder / tickets (demo) 
SI-01 Partial See evidence folder / tickets (demo) 
EX-01 Pass See evidence folder / tickets (demo) 
G. Risk Register (Key Items) 

Risk ID 
Description Likelihood Impact Inherent Mitigation Residual Owner 

R-01 Non–U.S. Person 
access to 
ITAR 
code/data 
Medium High High Enforce attribute 
based 
access; 
segregate 
repos; 
Low PI

Distribution Statement: For Official Use in Demo Only • Do not use on real projects 
UNCLASSIFIED // CUI – ITAR-CONTROLLED (Sample Test Data) 

R-02 Egress to foreign 
validation 
service 
enabled by 
default 
R-03 Incomplete DMP for CUI 
specifics 
R-04 Audit log immutability 
not proven 
DLP; 
training 
Low High Medium Default deny 
egress; 
change 
control; 
license 
gate 
Medium Medium Medium Add IR, logging, 
SSP refs; 
review 
against 
800-171 
Medium High High Enable WORM; 
verify; 
monitor 
drift 
Low SecEng 
Low PM Low SecOps 

H. Plan of Actions & Milestones (POA&M) 

Finding Control Mapping 
Remediation Due Date Status Milestones Evidence 

AU 
immutability gaps 
AU 3.3.x Enable object 
lock/WORM, 
update SIEM 
parsers 
2025-10- 19 
Open WORM enabled; 
parser QA 
Config + SIEM 
export 

IR reporting playbook clarity 
IR 
3.6.1/.2, DFARS 
Revise IR 
plan; add 
DIBNet 
steps; 
conduct drill 
2025-11- 02 
Open Tabletop booked 
AAR, sign offs 

DMP 
completeness 
Program Complete sections; 
link SSP; 
2025-10- 12 
Open Draft in review 
Updated DMP

Distribution Statement: For Official Use in Demo Only • Do not use on real projects 
UNCLASSIFIED // CUI – ITAR-CONTROLLED (Sample Test Data) 
add media 
sanitization 
I. Evidence Checklist 
• IAM policies, role assumptions, MFA settings 
• S3 bucket/KMS key policies; encryption enforcement 
• VPC egress rules/flow logs; firewall change tickets 
• CloudTrail/OS/DB audit samples; SIEM correlation 
• IR Plan, tabletop AARs, reporting templates 
• Baseline configs, hardening scans (CIS/STIG) 
• Vuln scans, patch tickets, EDR alerts 
• Media sanitization certificates (NIST 800-88) 
• DLP rules; email/SCM restrictions; export license records 
• Training records (CUI/ITAR awareness) 
J. Approvals 
Prepared by Compliance Reviewer Name / Title / Date: Name / Title / Date: PI Approval AMERICAN SYSTEMS PM Approval Signature: Signature:
Distribution Statement: For Official Use in Demo Only • Do not use on real projects 
