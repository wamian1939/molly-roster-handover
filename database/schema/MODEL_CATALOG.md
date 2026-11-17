# 数据模型字段与约束目录

此目录由交接源码 Prisma schema 解析，不含数据；SQL 文件才是实际 D1 DDL。@db.Date、DateTime、Decimal、Json、数组和枚举按源属性保留。Postgres 迁移可能包含模型未表达的触发器/排他约束，须同时阅读迁移。

## production-site/generated/roster.prisma

### RosterPeriod

```prisma
model RosterPeriod {
  id                 String              @id @default(cuid())
  storeId            String
  startDate          DateTime            @db.Date
  endDate            DateTime            @db.Date
  cycleType          RosterCycleType
  status             RosterStatus        @default(DRAFT)
  version            Int                 @default(1)
  createdByAccountId String
  createdAt          DateTime            @default(now())
  updatedAt          DateTime            @updatedAt
  publishedAt        DateTime?
  shifts             Shift[]
  publications       RosterPublication[]

  @@unique([storeId, startDate, endDate])
  @@unique([id, storeId])
  @@index([storeId, status, startDate])
  @@index([storeId, endDate])
  @@map("roster_periods")
}
```

### ShiftRole

```prisma
model ShiftRole {
  id                  String          @id @default(cuid())
  storeId             String?
  code                String
  nameZh              String
  colorToken          String
  requiredSkillCodes  String[]        @default([])
  isActive            Boolean         @default(true)
  displayOrder        Int             @default(0)
  version             Int             @default(1)
  createdAt           DateTime        @default(now())
  updatedAt           DateTime        @updatedAt
  shifts              Shift[]
  templates           ShiftTemplate[]

  @@unique([storeId, code])
  @@index([storeId, isActive, displayOrder])
  @@map("shift_roles")
}
```

### Shift

```prisma
model Shift {
  id                 String            @id @default(cuid())
  rosterPeriodId     String
  storeId            String
  date               DateTime          @db.Date
  startAt            DateTime
  endAt              DateTime
  breakMinutes       Int               @default(0)
  shiftRoleId        String
  roleNameSnapshot   String
  roleColorSnapshot  String
  publicNote         String?
  internalNote       String?
  version            Int               @default(1)
  createdByAccountId String
  updatedByAccountId String
  createdAt          DateTime          @default(now())
  updatedAt          DateTime          @updatedAt
  rosterPeriod       RosterPeriod      @relation(fields: [rosterPeriodId, storeId], references: [id, storeId], onDelete: Cascade)
  shiftRole          ShiftRole         @relation(fields: [shiftRoleId], references: [id], onDelete: Restrict)
  assignments        ShiftAssignment[]

  @@index([storeId, date, startAt])
  @@index([rosterPeriodId, date])
  @@index([shiftRoleId])
  @@map("shifts")
}
```

### ShiftAssignment

```prisma
model ShiftAssignment {
  id                       String   @id @default(cuid())
  shiftId                  String
  employeeId               String
  employeeNameSnapshot     String
  employeeTypeSnapshot     String
  employmentTypeSnapshot   String?
  officialScoreSnapshot    Decimal? @db.Decimal(5, 2)
  tierSnapshot             String?
  officialScoreRoundId     String?
  officialScoreClosedAt    DateTime?
  createdAt                DateTime @default(now())
  shift                    Shift    @relation(fields: [shiftId], references: [id], onDelete: Cascade)

  @@unique([shiftId, employeeId])
  @@index([employeeId])
  @@index([shiftId])
  @@map("shift_assignments")
}
```

### ShiftCreateRequest

```prisma
model ShiftCreateRequest {
  id          String   @id @db.Uuid
  storeId     String
  accountId   String
  shiftId     String   @unique
  payloadHash String
  createdAt   DateTime @default(now())

  @@index([storeId, accountId])
  @@map("shift_create_requests")
}
```

### EmployeeAvailability

```prisma
model EmployeeAvailability {
  id             String             @id @default(cuid())
  employeeId     String
  storeId        String
  date           DateTime           @db.Date
  startAt        DateTime?
  endAt          DateTime?
  status         AvailabilityStatus
  note           String?
  source         AvailabilitySource @default(MANUAL)
  version        Int                @default(1)
  createdAt      DateTime           @default(now())
  updatedAt      DateTime           @updatedAt

  @@index([storeId, date])
  @@index([employeeId, date])
  @@index([storeId, employeeId, date])
  @@map("employee_availability")
}
```

### AvailabilityScriptImport

```prisma
model AvailabilityScriptImport {
  id             String   @id @default(cuid())
  storeId        String
  actorAccountId String
  sourceHash     String
  weekStart      DateTime @db.Date
  mode           String   @default("APPEND")
  createdCount   Int
  unchangedCount Int
  createdAt      DateTime @default(now())

  @@unique([storeId, sourceHash])
  @@index([storeId, createdAt])
  @@map("availability_script_imports")
}
```

### AvailabilityScriptShortcuts

```prisma
model AvailabilityScriptShortcuts {
  storeId            String   @id
  shortcuts          Json
  version            Int      @default(1)
  updatedByAccountId String
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  @@map("availability_script_shortcuts")
}
```

### ShiftTemplate

```prisma
model ShiftTemplate {
  id             String     @id @default(cuid())
  storeId        String
  name           String
  startTime      String
  endTime        String
  breakMinutes   Int        @default(0)
  shiftRoleId    String?
  isActive       Boolean    @default(true)
  displayOrder   Int        @default(0)
  version        Int        @default(1)
  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt
  shiftRole      ShiftRole? @relation(fields: [shiftRoleId], references: [id], onDelete: SetNull)

  @@unique([storeId, name])
  @@index([storeId, isActive, displayOrder])
  @@map("shift_templates")
}
```

### AvailabilityTemplate

```prisma
model AvailabilityTemplate {
  id           String   @id @default(cuid())
  storeId      String
  name         String
  slots        Json
  isActive     Boolean  @default(true)
  displayOrder Int      @default(0)
  version      Int      @default(1)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@unique([storeId, name])
  @@index([storeId, isActive, displayOrder])
  @@map("availability_templates")
}
```

### RosterPublication

```prisma
model RosterPublication {
  id                   String       @id @default(cuid())
  rosterPeriodId       String
  periodVersion        Int
  publishedByAccountId String
  publishedAt          DateTime     @default(now())
  snapshot             Json
  rosterPeriod         RosterPeriod @relation(fields: [rosterPeriodId], references: [id], onDelete: Restrict)

  @@unique([rosterPeriodId, periodVersion])
  @@index([rosterPeriodId, publishedAt])
  @@map("roster_publications")
}
```

### RosterStoreSettings

```prisma
model RosterStoreSettings {
  id                     String          @id @default(cuid())
  storeId                String          @unique
  timezone               String          @default("Australia/Sydney")
  openingTime            String          @default("09:00")
  closingTime            String          @default("22:00")
  slotIntervalMinutes    Int             @default(30)
  minimumShiftMinutes    Int             @default(60)
  defaultBreakMinutes    Int             @default(30)
  weekStartsOn           Int             @default(1)
  cycleType              RosterCycleType @default(WEEK)
  fortnightAnchorDate    String?         @db.VarChar(10)
  weeklyHourWarning      Int             @default(38)
  dailyHourWarning       Int             @default(10)
  version                Int             @default(1)
  createdAt              DateTime        @default(now())
  updatedAt              DateTime        @updatedAt

  @@map("roster_store_settings")
}
```

### PayrollDocument

```prisma
model PayrollDocument {
 id String @id
 kind String
 body String
 version Int @default(1)
 updatedAt String @map("updated_at")
 @@index([kind, updatedAt], map: "payroll_documents_kind_updated")
 @@map("payroll_documents")
}
```

### PayrollLock

```prisma
model PayrollLock {
 id String @id
 owner String
 expiresAt BigInt @map("expires_at")
 @@map("payroll_locks")
}
```

### PayrollAudit

```prisma
model PayrollAudit {
 id String @id
 actorId String @map("actor_id")
 event String
 body String
 createdAt String @map("created_at")
 @@index([createdAt], map: "payroll_audit_created")
 @@map("payroll_audit")
}
```

## production-site/generated/evaluate.prisma

### Store

```prisma
model Store {
  id               String            @id
  name             String
  region           String
  managerName      String
  city             String
  isActive         Boolean           @default(true)
  archivedAt       DateTime?
  employees        Employee[]
  evaluations      Evaluation[]
  performanceNotes PerformanceNote[]
  aiAnalysisRuns   AiAnalysisRun[]
  accountAccesses  UserAccountStoreAccess[]
  evaluationRounds EvaluationRound[]
  jobDefinitions   StoreJobDefinition[]

  @@index([isActive, name])
  @@map("stores")
}
```

### UserAccount

```prisma
model UserAccount {
  id                      String                     @id @default(cuid())
  username                String                     @unique
  displayName             String
  passwordHash            String
  role                    AccountRole
  isActive                Boolean                    @default(true)
  deletedAt               DateTime?
  deletedByAccountId      String?
  lastLoginAt             DateTime?
  createdAt               DateTime                   @default(now())
  updatedAt               DateTime                   @updatedAt
  storeAccesses           UserAccountStoreAccess[]   @relation("AccountStoreAccesses")
  assignedStoreAccesses   UserAccountStoreAccess[]   @relation("AccountStoreAccessAssigner")
  deletedBy               UserAccount?               @relation("UserAccountDeletedBy", fields: [deletedByAccountId], references: [id], onDelete: SetNull)
  deletedAccounts         UserAccount[]              @relation("UserAccountDeletedBy")
  sessions                AuthSession[]
  evaluations             Evaluation[]               @relation("EvaluationEvaluatorAccount")
  roundMemberships        EvaluationRoundEvaluator[]
  createdEvaluationRounds EvaluationRound[]          @relation("EvaluationRoundCreator")
  authAuditEvents         AuthAuditEvent[]
  assignedEmployeeJobs    EmployeeJobAssignment[] @relation("EmployeeJobAssigner")
  currentSkillConfirmations CurrentSkillConfirmation[]

  @@index([role, isActive])
  @@index([deletedAt, role, isActive])
  @@map("user_accounts")
}
```

### UserAccountStoreAccess

```prisma
model UserAccountStoreAccess {
  accountId          String
  storeId            String
  assignedAt         DateTime    @default(now())
  assignedByAccountId String?
  account            UserAccount @relation("AccountStoreAccesses", fields: [accountId], references: [id], onDelete: Cascade)
  store              Store       @relation(fields: [storeId], references: [id], onDelete: Cascade)
  assignedByAccount  UserAccount? @relation("AccountStoreAccessAssigner", fields: [assignedByAccountId], references: [id], onDelete: SetNull)

  @@id([accountId, storeId])
  @@index([storeId, accountId])
  @@index([assignedByAccountId])
  @@map("user_account_store_accesses")
}
```

### AuthSession

```prisma
model AuthSession {
  id         String      @id @default(cuid())
  userId     String
  tokenHash  String      @unique
  expiresAt  DateTime
  createdAt  DateTime    @default(now())
  lastUsedAt DateTime    @default(now())
  user       UserAccount @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
  @@map("auth_sessions")
}
```

### AuthAuditEvent

```prisma
model AuthAuditEvent {
  id        String             @id @default(cuid())
  accountId String?
  eventType AuthAuditEventType
  createdAt DateTime           @default(now())
  metadata  Json?
  account   UserAccount?       @relation(fields: [accountId], references: [id], onDelete: SetNull)

  @@index([accountId, createdAt])
  @@index([eventType, createdAt])
  @@map("auth_audit_events")
}
```

### LoginRateLimit

```prisma
model LoginRateLimit {
  keyHash      String   @id @db.Char(64)
  attemptCount Int
  startedAt    DateTime @default(now())

  @@index([startedAt])
  @@map("login_rate_limits")
}
```

### Employee

```prisma
model Employee {
  id                             String            @id @default(cuid())
  storeId                        String
  displayName                    String
  surname                        String?
  givenName                      String?
  englishName                    String?
  gender                         Gender?
  dateOfBirth                    DateTime?         @db.Date
  employmentType                 EmploymentType
  status                         EmployeeStatus    @default(Active)
  employeeType                   EmployeeType      @default(REGULAR)
  emailAddress                   String?
  mobileTelephoneNumber          String?
  addressLine                    String?
  suburb                         String?
  state                          String?
  postcode                       String?
  employmentCommencementDate     DateTime?         @db.Date
  bankAccountName                String?
  bsbNumber                      String?
  bankAccountNumber              String?
  taxFileNumber                  String?
  abn                            String?
  holdsWorkingHolidayVisa        Boolean?
  visaType                       String?
  superannuationCompany          String?
  superannuationAccountNumber    String?
  uniqueSuperannuationIdentifier String?
  createdAt                      DateTime          @default(now())
  updatedAt                      DateTime          @updatedAt
  archivedAt                     DateTime?
  store                          Store             @relation(fields: [storeId], references: [id], onDelete: Restrict)
  evaluations                    Evaluation[]
  performanceNotes               PerformanceNote[]
  aiAnalysisRuns                 AiAnalysisRun[]
  skills                         EmployeeSkill[]
  evaluationRounds               EvaluationRound[]
  jobAssignments                 EmployeeJobAssignment[]
  currentSkillConfirmations      CurrentSkillConfirmation[]

  @@unique([id, storeId])
  @@index([storeId])
  @@index([status])
  @@index([storeId, status])
  @@index([storeId, status, employeeType])
  @@index([displayName])
  @@index([englishName])
  @@map("employees")
}
```

### EvaluationRound

```prisma
model EvaluationRound {
  id                          String                     @id @default(cuid())
  employeeId                  String
  storeId                     String
  employeeTypeSnapshot        EmployeeType
  employeeDisplayNameSnapshot String?
  storeNameSnapshot           String?
  scoringVersion              String
  scoringPolicySnapshot       Json
  skillBaselineSnapshot       Json
  roundNumber                 Int                        @default(1)
  openedAt                    DateTime                   @default(now())
  status                      EvaluationRoundStatus      @default(OPEN)
  createdByAccountId          String?
  createdAt                   DateTime                   @default(now())
  closedAt                    DateTime?
  closedEligibleCount         Int?
  closedSubmittedCount        Int?
  finalAggregateOverall       Decimal?                   @db.Decimal(5, 2)
  finalAggregateTier          TierV1?
  finalAggregateComponents    Json?
  finalAggregateSkillCoverage Decimal?                   @db.Decimal(5, 4)
  employeeJobsSnapshot        Json?
  employee                    Employee                   @relation(fields: [employeeId], references: [id], onDelete: Restrict)
  store                       Store                      @relation(fields: [storeId], references: [id], onDelete: Restrict)
  createdByAccount            UserAccount?               @relation("EvaluationRoundCreator", fields: [createdByAccountId], references: [id], onDelete: SetNull)
  evaluators                  EvaluationRoundEvaluator[]
  evaluations                 Evaluation[]

  @@unique([id, employeeId, storeId])
  @@unique([employeeId, roundNumber], map: "evaluation_rounds_employee_round_number_key")
  @@index([employeeId, status])
  @@index([employeeId, status, createdAt(sort: Desc), id(sort: Desc)])
  @@index([storeId, status])
  @@index([status, createdAt])
  @@index([employeeJobsSnapshot(ops: JsonbPathOps)], type: Gin)
  @@map("evaluation_rounds")
}
```

### StoreJobDefinition

```prisma
model StoreJobDefinition {
  id           String                  @id @default(cuid())
  storeId      String
  name         String
  code         String?
  colorToken   String                  @default("slate")
  displayOrder Int                     @default(0)
  isActive     Boolean                 @default(true)
  createdAt    DateTime                @default(now())
  updatedAt    DateTime                @default(now()) @updatedAt
  store        Store                   @relation(fields: [storeId], references: [id], onDelete: Restrict)
  assignments  EmployeeJobAssignment[]

  @@unique([id, storeId])
  @@unique([storeId, name])
  @@index([storeId, isActive, displayOrder])
  @@map("store_job_definitions")
}
```

### EmployeeJobAssignment

```prisma
model EmployeeJobAssignment {
  employeeId          String
  jobId               String
  storeId             String
  assignedAt          DateTime           @default(now())
  assignedByAccountId String?
  employee            Employee           @relation(fields: [employeeId, storeId], references: [id, storeId], onDelete: Cascade)
  job                 StoreJobDefinition @relation(fields: [jobId, storeId], references: [id, storeId], onDelete: Restrict)
  assignedByAccount   UserAccount?        @relation("EmployeeJobAssigner", fields: [assignedByAccountId], references: [id], onDelete: SetNull)

  @@id([employeeId, jobId])
  @@index([jobId])
  @@index([jobId, storeId])
  @@index([assignedByAccountId])
  @@map("employee_job_assignments")
}
```

### EvaluationRoundEvaluator

```prisma
model EvaluationRoundEvaluator {
  id                           String          @id @default(cuid())
  roundId                      String
  evaluatorAccountId           String?
  evaluatorDisplayNameSnapshot String
  excludedAt                   DateTime?
  exclusionReason              String?
  createdAt                    DateTime        @default(now())
  round                        EvaluationRound @relation(fields: [roundId], references: [id], onDelete: Cascade)
  evaluatorAccount             UserAccount?    @relation(fields: [evaluatorAccountId], references: [id], onDelete: SetNull)

  @@unique([roundId, evaluatorAccountId])
  @@index([roundId, excludedAt])
  @@index([evaluatorAccountId, roundId])
  @@map("evaluation_round_evaluators")
}
```

### SkillDefinition

```prisma
model SkillDefinition {
  id             String          @id @default(cuid())
  code           String          @unique
  nameZh         String
  nameEn         String
  category       String
  skillMode      SkillMode       @default(PROGRESSIVE)
  weight         Decimal         @db.Decimal(6, 3)
  displayOrder   Int
  isActive       Boolean         @default(true)
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @default(now()) @updatedAt
  employeeSkills EmployeeSkill[]
  currentSkillConfirmations CurrentSkillConfirmation[]

  @@index([isActive, category, displayOrder])
  @@map("skill_definitions")
}
```

### EmployeeSkill

```prisma
model EmployeeSkill {
  id                String          @id @default(cuid())
  employeeId        String
  skillDefinitionId String
  status            SkillStatus
  updatedBy         String?
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @default(now()) @updatedAt
  employee          Employee        @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  skillDefinition   SkillDefinition @relation(fields: [skillDefinitionId], references: [id], onDelete: Restrict)

  @@unique([employeeId, skillDefinitionId])
  @@index([employeeId, status])
  @@index([skillDefinitionId, status])
  @@map("employee_skills")
}
```

### CurrentSkillConfirmation

```prisma
model CurrentSkillConfirmation {
  id                   String          @id @default(cuid())
  employeeId           String
  skillDefinitionId    String
  previousStatus       SkillStatus?
  confirmedStatus      SkillStatus
  confirmedByAccountId String
  reason               String?         @db.VarChar(500)
  confirmedAt          DateTime        @default(now())
  employee             Employee        @relation(fields: [employeeId], references: [id], onDelete: Restrict)
  skillDefinition      SkillDefinition @relation(fields: [skillDefinitionId], references: [id], onDelete: Restrict)
  confirmedByAccount   UserAccount     @relation(fields: [confirmedByAccountId], references: [id], onDelete: Restrict)

  @@index([employeeId, confirmedAt])
  @@index([skillDefinitionId, confirmedAt])
  @@map("current_skill_confirmations")
}
```

### Evaluation

```prisma
model Evaluation {
  id                    String                    @id @default(cuid())
  employeeId            String
  storeId               String
  evaluatorId           String?
  evaluatorAccountId    String?
  evaluatorRoleSnapshot AccountRole?
  roundId               String
  evaluationPeriod      String?
  evaluationStatus      EvaluationStatus
  scoringVersion        String                    @default("legacy-v0")
  employeeTypeSnapshot  EmployeeType
  scoringPolicySnapshot Json
  attitudeScore         Int?
  attendanceScore       Int?
  skillScore            Int?
  pressureHandlingScore Int?
  teamworkScore         Int?
  executionScore        Int?
  serviceQualityScore   Int?
  growthPotentialScore  Int?
  manualWeightedScore   Decimal?                  @db.Decimal(5, 2)
  textReview            String                    @default("")
  aiTextScore           Int?
  aiRiskScore           Int?
  riskLevel             RiskLevel?
  finalScore            Decimal?                  @db.Decimal(5, 2)
  grade                 Grade?
  speedRating           Int?
  initiativeRating      Int?
  attitudeRating        Int?
  availabilityRating    Int?
  skillScoreV1          Decimal?                  @db.Decimal(5, 2)
  speedScoreV1          Decimal?                  @db.Decimal(5, 2)
  initiativeScoreV1     Decimal?                  @db.Decimal(5, 2)
  attitudeScoreV1       Decimal?                  @db.Decimal(5, 2)
  availabilityScoreV1   Decimal?                  @db.Decimal(5, 2)
  textScoreV1           Decimal?                  @db.Decimal(5, 2)
  overallScoreV1        Decimal?                  @db.Decimal(5, 2)
  tierV1                TierV1?
  skillCoverageV1       Decimal?                  @db.Decimal(5, 4)
  textFeedback          String?
  textScoreSourceV1     V1TextScoreSource?
  selectedAiRunId       String?
  employeeNameSnapshot  String?
  employeeRoleSnapshot  String?
  storeNameSnapshot     String?
  evaluatorNameSnapshot String?
  version               Int                       @default(0)
  createdAt             DateTime                  @default(now())
  updatedAt             DateTime                  @updatedAt
  completedAt           DateTime?
  submittedAt           DateTime?
  employee              Employee                  @relation(fields: [employeeId], references: [id], onDelete: Restrict)
  store                 Store                     @relation(fields: [storeId], references: [id], onDelete: Restrict)
  evaluatorAccount      UserAccount?              @relation("EvaluationEvaluatorAccount", fields: [evaluatorAccountId], references: [id], onDelete: SetNull)
  round                 EvaluationRound           @relation(fields: [roundId, employeeId, storeId], references: [id, employeeId, storeId], onDelete: Restrict)
  skillSnapshots        EvaluationSkillSnapshot[]
  v1AiRuns              EvaluationAiRun[]

  @@unique([employeeId, storeId, evaluationPeriod])
  @@unique([roundId, evaluatorAccountId])
  @@index([storeId])
  @@index([employeeId])
  @@index([evaluatorAccountId])
  @@index([roundId, evaluationStatus, completedAt])
  @@index([evaluationPeriod])
  @@index([evaluationStatus])
  @@index([riskLevel])
  @@index([finalScore])
  @@index([storeId, evaluationPeriod])
  @@index([employeeId, evaluationPeriod])
  @@index([scoringVersion, evaluationStatus, completedAt])
  // PostgreSQL truncated these historical SQL index names to 63 bytes.
  @@index([storeId, scoringVersion, evaluationStatus, completedAt], map: "evaluations_storeId_scoringVersion_evaluationStatus_completedAt")
  @@index([employeeId, scoringVersion, evaluationStatus, completedAt], map: "evaluations_employeeId_scoringVersion_evaluationStatus_complete")
  @@map("evaluations")
}
```

### EvaluationSkillSnapshot

```prisma
model EvaluationSkillSnapshot {
  id                String      @id @default(cuid())
  evaluationId      String
  skillDefinitionId String?
  skillCode         String
  skillNameZh       String
  skillNameEn       String
  category          String
  skillMode         SkillMode   @default(PROGRESSIVE)
  status            SkillStatus
  statusFactor      Decimal     @db.Decimal(5, 4)
  weight            Decimal     @db.Decimal(6, 3)
  contribution      Decimal     @db.Decimal(8, 4)
  createdAt         DateTime    @default(now())
  evaluation        Evaluation  @relation(fields: [evaluationId], references: [id], onDelete: Cascade)

  @@unique([evaluationId, skillCode])
  @@index([evaluationId])
  @@map("evaluation_skill_snapshots")
}
```

### EvaluationAiRun

```prisma
model EvaluationAiRun {
  id                   String                 @id @default(cuid())
  evaluationId         String
  status               EvaluationAiRunStatus
  provider             String
  model                String
  textFeedbackSnapshot String
  textScore            Decimal                @db.Decimal(5, 2)
  rawResponse          Json?
  errorMessage         String?
  createdAt            DateTime               @default(now())
  completedAt          DateTime               @default(now())
  evaluation           Evaluation             @relation(fields: [evaluationId], references: [id], onDelete: Cascade)
  evidence             EvaluationAiEvidence[]

  @@index([evaluationId, createdAt])
  @@index([status])
  @@map("evaluation_ai_runs")
}
```

### EvaluationAiEvidence

```prisma
model EvaluationAiEvidence {
  id         String                   @id @default(cuid())
  aiRunId    String
  type       EvaluationAiEvidenceType
  dimension  String?
  skillCode  String?
  message    String
  confidence Decimal?                 @db.Decimal(5, 4)
  createdAt  DateTime                 @default(now())
  aiRun      EvaluationAiRun          @relation(fields: [aiRunId], references: [id], onDelete: Cascade)

  @@index([aiRunId, type])
  @@map("evaluation_ai_evidence")
}
```

### AiAnalysisRun

```prisma
model AiAnalysisRun {
  id                  String   @id @default(cuid())
  employeeId          String
  storeId             String
  evaluationPeriod    String
  evaluationId        String?
  triggeredByUserId   String?
  provider            String
  model               String
  status              String
  textReviewSnapshot  String
  includedRecentNotes Boolean  @default(false)
  recentNotesCount    Int      @default(0)
  aiTextScore         Int?
  aiRiskScore         Int?
  summary             String?
  strengths           Json?
  improvementAreas    Json?
  dimensionSignals    Json?
  errorMessage        String?
  latencyMs           Int?
  createdAt           DateTime @default(now())
  employee            Employee @relation(fields: [employeeId], references: [id], onDelete: Restrict)
  store               Store    @relation(fields: [storeId], references: [id], onDelete: Restrict)

  @@index([employeeId])
  @@index([storeId])
  @@index([evaluationId])
  @@index([evaluationPeriod])
  @@index([status])
  @@index([createdAt])
  @@index([employeeId, storeId, evaluationPeriod])
  @@map("ai_analysis_runs")
}
```

### PerformanceNote

```prisma
model PerformanceNote {
  id          String              @id @default(cuid())
  employeeId  String
  storeId     String
  authorId    String?
  noteDate    DateTime            @default(now())
  noteType    PerformanceNoteType
  dimensions  String[]            @default([])
  scoreImpact Int?
  noteText    String
  createdAt   DateTime            @default(now())
  updatedAt   DateTime            @updatedAt
  employee    Employee            @relation(fields: [employeeId], references: [id], onDelete: Restrict)
  store       Store               @relation(fields: [storeId], references: [id], onDelete: Restrict)

  @@index([employeeId])
  @@index([storeId])
  @@index([noteType])
  @@index([noteDate])
  @@index([storeId, noteDate])
  @@index([employeeId, noteDate])
  @@map("performance_notes")
}
```

## local/roster/backend/prisma/schema.prisma

### RosterPeriod

```prisma
model RosterPeriod {
  id                 String              @id @default(cuid())
  storeId            String
  startDate          DateTime            @db.Date
  endDate            DateTime            @db.Date
  cycleType          RosterCycleType
  status             RosterStatus        @default(DRAFT)
  version            Int                 @default(1)
  createdByAccountId String
  createdAt          DateTime            @default(now())
  updatedAt          DateTime            @updatedAt
  publishedAt        DateTime?
  shifts             Shift[]
  publications       RosterPublication[]

  @@unique([storeId, startDate, endDate])
  @@unique([id, storeId])
  @@index([storeId, status, startDate])
  @@index([storeId, endDate])
  @@map("roster_periods")
}
```

### ShiftRole

```prisma
model ShiftRole {
  id                  String          @id @default(cuid())
  storeId             String?
  code                String
  nameZh              String
  colorToken          String
  requiredSkillCodes  String[]        @default([])
  isActive            Boolean         @default(true)
  displayOrder        Int             @default(0)
  version             Int             @default(1)
  createdAt           DateTime        @default(now())
  updatedAt           DateTime        @updatedAt
  shifts              Shift[]
  templates           ShiftTemplate[]

  @@unique([storeId, code])
  @@index([storeId, isActive, displayOrder])
  @@map("shift_roles")
}
```

### Shift

```prisma
model Shift {
  id                 String            @id @default(cuid())
  rosterPeriodId     String
  storeId            String
  date               DateTime          @db.Date
  startAt            DateTime
  endAt              DateTime
  breakMinutes       Int               @default(0)
  shiftRoleId        String
  roleNameSnapshot   String
  roleColorSnapshot  String
  publicNote         String?
  internalNote       String?
  version            Int               @default(1)
  createdByAccountId String
  updatedByAccountId String
  createdAt          DateTime          @default(now())
  updatedAt          DateTime          @updatedAt
  rosterPeriod       RosterPeriod      @relation(fields: [rosterPeriodId, storeId], references: [id, storeId], onDelete: Cascade)
  shiftRole          ShiftRole         @relation(fields: [shiftRoleId], references: [id], onDelete: Restrict)
  assignments        ShiftAssignment[]

  @@index([storeId, date, startAt])
  @@index([rosterPeriodId, date])
  @@index([shiftRoleId])
  @@map("shifts")
}
```

### ShiftAssignment

```prisma
model ShiftAssignment {
  id                       String   @id @default(cuid())
  shiftId                  String
  employeeId               String
  employeeNameSnapshot     String
  employeeTypeSnapshot     String
  employmentTypeSnapshot   String?
  officialScoreSnapshot    Decimal? @db.Decimal(5, 2)
  tierSnapshot             String?
  officialScoreRoundId     String?
  officialScoreClosedAt    DateTime?
  createdAt                DateTime @default(now())
  shift                    Shift    @relation(fields: [shiftId], references: [id], onDelete: Cascade)

  @@unique([shiftId, employeeId])
  @@index([employeeId])
  @@index([shiftId])
  @@map("shift_assignments")
}
```

### ShiftCreateRequest

```prisma
model ShiftCreateRequest {
  id          String   @id @db.Uuid
  storeId     String
  accountId   String
  shiftId     String   @unique
  payloadHash String
  createdAt   DateTime @default(now())

  @@index([storeId, accountId])
  @@map("shift_create_requests")
}
```

### EmployeeAvailability

```prisma
model EmployeeAvailability {
  id             String             @id @default(cuid())
  employeeId     String
  storeId        String
  date           DateTime           @db.Date
  startAt        DateTime?
  endAt          DateTime?
  status         AvailabilityStatus
  note           String?
  source         AvailabilitySource @default(MANUAL)
  version        Int                @default(1)
  createdAt      DateTime           @default(now())
  updatedAt      DateTime           @updatedAt

  @@index([storeId, date])
  @@index([employeeId, date])
  @@index([storeId, employeeId, date])
  @@map("employee_availability")
}
```

### AvailabilityScriptImport

```prisma
model AvailabilityScriptImport {
  id             String   @id @default(cuid())
  storeId        String
  actorAccountId String
  sourceHash     String
  weekStart      DateTime @db.Date
  mode           String   @default("APPEND")
  createdCount   Int
  unchangedCount Int
  createdAt      DateTime @default(now())

  @@unique([storeId, sourceHash])
  @@index([storeId, createdAt])
  @@map("availability_script_imports")
}
```

### AvailabilityScriptShortcuts

```prisma
model AvailabilityScriptShortcuts {
  storeId            String   @id
  shortcuts          Json
  version            Int      @default(1)
  updatedByAccountId String
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  @@map("availability_script_shortcuts")
}
```

### ShiftTemplate

```prisma
model ShiftTemplate {
  id             String     @id @default(cuid())
  storeId        String
  name           String
  startTime      String
  endTime        String
  breakMinutes   Int        @default(0)
  shiftRoleId    String?
  isActive       Boolean    @default(true)
  displayOrder   Int        @default(0)
  version        Int        @default(1)
  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt
  shiftRole      ShiftRole? @relation(fields: [shiftRoleId], references: [id], onDelete: SetNull)

  @@unique([storeId, name])
  @@index([storeId, isActive, displayOrder])
  @@map("shift_templates")
}
```

### AvailabilityTemplate

```prisma
model AvailabilityTemplate {
  id           String   @id @default(cuid())
  storeId      String
  name         String
  slots        Json
  isActive     Boolean  @default(true)
  displayOrder Int      @default(0)
  version      Int      @default(1)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@unique([storeId, name])
  @@index([storeId, isActive, displayOrder])
  @@map("availability_templates")
}
```

### RosterPublication

```prisma
model RosterPublication {
  id                   String       @id @default(cuid())
  rosterPeriodId       String
  periodVersion        Int
  publishedByAccountId String
  publishedAt          DateTime     @default(now())
  snapshot             Json
  rosterPeriod         RosterPeriod @relation(fields: [rosterPeriodId], references: [id], onDelete: Restrict)

  @@unique([rosterPeriodId, periodVersion])
  @@index([rosterPeriodId, publishedAt])
  @@map("roster_publications")
}
```

### RosterStoreSettings

```prisma
model RosterStoreSettings {
  id                     String          @id @default(cuid())
  storeId                String          @unique
  timezone               String          @default("Australia/Sydney")
  openingTime            String          @default("09:00")
  closingTime            String          @default("22:00")
  slotIntervalMinutes    Int             @default(30)
  minimumShiftMinutes    Int             @default(60)
  defaultBreakMinutes    Int             @default(30)
  weekStartsOn           Int             @default(1)
  cycleType              RosterCycleType @default(WEEK)
  fortnightAnchorDate    String?         @db.VarChar(10)
  weeklyHourWarning      Int             @default(38)
  dailyHourWarning       Int             @default(10)
  version                Int             @default(1)
  createdAt              DateTime        @default(now())
  updatedAt              DateTime        @updatedAt

  @@map("roster_store_settings")
}
```

### PayrollDocument

```prisma
model PayrollDocument {
 id String @id
 kind String
 body String
 version Int @default(1)
 updatedAt String @map("updated_at")
 @@index([kind, updatedAt], map: "payroll_documents_kind_updated")
 @@map("payroll_documents")
}
```

### PayrollLock

```prisma
model PayrollLock {
 id String @id
 owner String
 expiresAt BigInt @map("expires_at")
 @@map("payroll_locks")
}
```

### PayrollAudit

```prisma
model PayrollAudit {
 id String @id
 actorId String @map("actor_id")
 event String
 body String
 createdAt String @map("created_at")
 @@index([createdAt], map: "payroll_audit_created")
 @@map("payroll_audit")
}
```

## local/evaluate/backend/prisma/schema.prisma

### Store

```prisma
model Store {
  id               String            @id
  name             String
  region           String
  managerName      String
  city             String
  isActive         Boolean           @default(true)
  archivedAt       DateTime?
  employees        Employee[]
  evaluations      Evaluation[]
  performanceNotes PerformanceNote[]
  aiAnalysisRuns   AiAnalysisRun[]
  accountAccesses  UserAccountStoreAccess[]
  evaluationRounds EvaluationRound[]
  jobDefinitions   StoreJobDefinition[]

  @@index([isActive, name])
  @@map("stores")
}
```

### UserAccount

```prisma
model UserAccount {
  id                      String                     @id @default(cuid())
  username                String                     @unique
  displayName             String
  passwordHash            String
  role                    AccountRole
  isActive                Boolean                    @default(true)
  deletedAt               DateTime?
  deletedByAccountId      String?
  lastLoginAt             DateTime?
  createdAt               DateTime                   @default(now())
  updatedAt               DateTime                   @updatedAt
  storeAccesses           UserAccountStoreAccess[]   @relation("AccountStoreAccesses")
  assignedStoreAccesses   UserAccountStoreAccess[]   @relation("AccountStoreAccessAssigner")
  deletedBy               UserAccount?               @relation("UserAccountDeletedBy", fields: [deletedByAccountId], references: [id], onDelete: SetNull)
  deletedAccounts         UserAccount[]              @relation("UserAccountDeletedBy")
  sessions                AuthSession[]
  evaluations             Evaluation[]               @relation("EvaluationEvaluatorAccount")
  roundMemberships        EvaluationRoundEvaluator[]
  createdEvaluationRounds EvaluationRound[]          @relation("EvaluationRoundCreator")
  authAuditEvents         AuthAuditEvent[]
  assignedEmployeeJobs    EmployeeJobAssignment[] @relation("EmployeeJobAssigner")
  currentSkillConfirmations CurrentSkillConfirmation[]

  @@index([role, isActive])
  @@index([deletedAt, role, isActive])
  @@map("user_accounts")
}
```

### UserAccountStoreAccess

```prisma
model UserAccountStoreAccess {
  accountId          String
  storeId            String
  assignedAt         DateTime    @default(now())
  assignedByAccountId String?
  account            UserAccount @relation("AccountStoreAccesses", fields: [accountId], references: [id], onDelete: Cascade)
  store              Store       @relation(fields: [storeId], references: [id], onDelete: Cascade)
  assignedByAccount  UserAccount? @relation("AccountStoreAccessAssigner", fields: [assignedByAccountId], references: [id], onDelete: SetNull)

  @@id([accountId, storeId])
  @@index([storeId, accountId])
  @@index([assignedByAccountId])
  @@map("user_account_store_accesses")
}
```

### AuthSession

```prisma
model AuthSession {
  id         String      @id @default(cuid())
  userId     String
  tokenHash  String      @unique
  expiresAt  DateTime
  createdAt  DateTime    @default(now())
  lastUsedAt DateTime    @default(now())
  user       UserAccount @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
  @@map("auth_sessions")
}
```

### AuthAuditEvent

```prisma
model AuthAuditEvent {
  id        String             @id @default(cuid())
  accountId String?
  eventType AuthAuditEventType
  createdAt DateTime           @default(now())
  metadata  Json?
  account   UserAccount?       @relation(fields: [accountId], references: [id], onDelete: SetNull)

  @@index([accountId, createdAt])
  @@index([eventType, createdAt])
  @@map("auth_audit_events")
}
```

### LoginRateLimit

```prisma
model LoginRateLimit {
  keyHash      String   @id @db.Char(64)
  attemptCount Int
  startedAt    DateTime @default(now())

  @@index([startedAt])
  @@map("login_rate_limits")
}
```

### Employee

```prisma
model Employee {
  id                             String            @id @default(cuid())
  storeId                        String
  displayName                    String
  surname                        String?
  givenName                      String?
  englishName                    String?
  gender                         Gender?
  dateOfBirth                    DateTime?         @db.Date
  employmentType                 EmploymentType
  status                         EmployeeStatus    @default(Active)
  employeeType                   EmployeeType      @default(REGULAR)
  emailAddress                   String?
  mobileTelephoneNumber          String?
  addressLine                    String?
  suburb                         String?
  state                          String?
  postcode                       String?
  employmentCommencementDate     DateTime?         @db.Date
  bankAccountName                String?
  bsbNumber                      String?
  bankAccountNumber              String?
  taxFileNumber                  String?
  abn                            String?
  holdsWorkingHolidayVisa        Boolean?
  visaType                       String?
  superannuationCompany          String?
  superannuationAccountNumber    String?
  uniqueSuperannuationIdentifier String?
  createdAt                      DateTime          @default(now())
  updatedAt                      DateTime          @updatedAt
  archivedAt                     DateTime?
  store                          Store             @relation(fields: [storeId], references: [id], onDelete: Restrict)
  evaluations                    Evaluation[]
  performanceNotes               PerformanceNote[]
  aiAnalysisRuns                 AiAnalysisRun[]
  skills                         EmployeeSkill[]
  evaluationRounds               EvaluationRound[]
  jobAssignments                 EmployeeJobAssignment[]
  currentSkillConfirmations      CurrentSkillConfirmation[]

  @@unique([id, storeId])
  @@index([storeId])
  @@index([status])
  @@index([storeId, status])
  @@index([storeId, status, employeeType])
  @@index([displayName])
  @@index([englishName])
  @@map("employees")
}
```

### EvaluationRound

```prisma
model EvaluationRound {
  id                          String                     @id @default(cuid())
  employeeId                  String
  storeId                     String
  employeeTypeSnapshot        EmployeeType
  employeeDisplayNameSnapshot String?
  storeNameSnapshot           String?
  scoringVersion              String
  scoringPolicySnapshot       Json
  skillBaselineSnapshot       Json
  roundNumber                 Int                        @default(1)
  openedAt                    DateTime                   @default(now())
  status                      EvaluationRoundStatus      @default(OPEN)
  createdByAccountId          String?
  createdAt                   DateTime                   @default(now())
  closedAt                    DateTime?
  closedEligibleCount         Int?
  closedSubmittedCount        Int?
  finalAggregateOverall       Decimal?                   @db.Decimal(5, 2)
  finalAggregateTier          TierV1?
  finalAggregateComponents    Json?
  finalAggregateSkillCoverage Decimal?                   @db.Decimal(5, 4)
  employeeJobsSnapshot        Json?
  employee                    Employee                   @relation(fields: [employeeId], references: [id], onDelete: Restrict)
  store                       Store                      @relation(fields: [storeId], references: [id], onDelete: Restrict)
  createdByAccount            UserAccount?               @relation("EvaluationRoundCreator", fields: [createdByAccountId], references: [id], onDelete: SetNull)
  evaluators                  EvaluationRoundEvaluator[]
  evaluations                 Evaluation[]

  @@unique([id, employeeId, storeId])
  @@unique([employeeId, roundNumber], map: "evaluation_rounds_employee_round_number_key")
  @@index([employeeId, status])
  @@index([employeeId, status, createdAt(sort: Desc), id(sort: Desc)])
  @@index([storeId, status])
  @@index([status, createdAt])
  @@index([employeeJobsSnapshot(ops: JsonbPathOps)], type: Gin)
  @@map("evaluation_rounds")
}
```

### StoreJobDefinition

```prisma
model StoreJobDefinition {
  id           String                  @id @default(cuid())
  storeId      String
  name         String
  code         String?
  colorToken   String                  @default("slate")
  displayOrder Int                     @default(0)
  isActive     Boolean                 @default(true)
  createdAt    DateTime                @default(now())
  updatedAt    DateTime                @default(now()) @updatedAt
  store        Store                   @relation(fields: [storeId], references: [id], onDelete: Restrict)
  assignments  EmployeeJobAssignment[]

  @@unique([id, storeId])
  @@unique([storeId, name])
  @@index([storeId, isActive, displayOrder])
  @@map("store_job_definitions")
}
```

### EmployeeJobAssignment

```prisma
model EmployeeJobAssignment {
  employeeId          String
  jobId               String
  storeId             String
  assignedAt          DateTime           @default(now())
  assignedByAccountId String?
  employee            Employee           @relation(fields: [employeeId, storeId], references: [id, storeId], onDelete: Cascade)
  job                 StoreJobDefinition @relation(fields: [jobId, storeId], references: [id, storeId], onDelete: Restrict)
  assignedByAccount   UserAccount?        @relation("EmployeeJobAssigner", fields: [assignedByAccountId], references: [id], onDelete: SetNull)

  @@id([employeeId, jobId])
  @@index([jobId])
  @@index([jobId, storeId])
  @@index([assignedByAccountId])
  @@map("employee_job_assignments")
}
```

### EvaluationRoundEvaluator

```prisma
model EvaluationRoundEvaluator {
  id                           String          @id @default(cuid())
  roundId                      String
  evaluatorAccountId           String?
  evaluatorDisplayNameSnapshot String
  excludedAt                   DateTime?
  exclusionReason              String?
  createdAt                    DateTime        @default(now())
  round                        EvaluationRound @relation(fields: [roundId], references: [id], onDelete: Cascade)
  evaluatorAccount             UserAccount?    @relation(fields: [evaluatorAccountId], references: [id], onDelete: SetNull)

  @@unique([roundId, evaluatorAccountId])
  @@index([roundId, excludedAt])
  @@index([evaluatorAccountId, roundId])
  @@map("evaluation_round_evaluators")
}
```

### SkillDefinition

```prisma
model SkillDefinition {
  id             String          @id @default(cuid())
  code           String          @unique
  nameZh         String
  nameEn         String
  category       String
  skillMode      SkillMode       @default(PROGRESSIVE)
  weight         Decimal         @db.Decimal(6, 3)
  displayOrder   Int
  isActive       Boolean         @default(true)
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @default(now()) @updatedAt
  employeeSkills EmployeeSkill[]
  currentSkillConfirmations CurrentSkillConfirmation[]

  @@index([isActive, category, displayOrder])
  @@map("skill_definitions")
}
```

### EmployeeSkill

```prisma
model EmployeeSkill {
  id                String          @id @default(cuid())
  employeeId        String
  skillDefinitionId String
  status            SkillStatus
  updatedBy         String?
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @default(now()) @updatedAt
  employee          Employee        @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  skillDefinition   SkillDefinition @relation(fields: [skillDefinitionId], references: [id], onDelete: Restrict)

  @@unique([employeeId, skillDefinitionId])
  @@index([employeeId, status])
  @@index([skillDefinitionId, status])
  @@map("employee_skills")
}
```

### CurrentSkillConfirmation

```prisma
model CurrentSkillConfirmation {
  id                   String          @id @default(cuid())
  employeeId           String
  skillDefinitionId    String
  previousStatus       SkillStatus?
  confirmedStatus      SkillStatus
  confirmedByAccountId String
  reason               String?         @db.VarChar(500)
  confirmedAt          DateTime        @default(now())
  employee             Employee        @relation(fields: [employeeId], references: [id], onDelete: Restrict)
  skillDefinition      SkillDefinition @relation(fields: [skillDefinitionId], references: [id], onDelete: Restrict)
  confirmedByAccount   UserAccount     @relation(fields: [confirmedByAccountId], references: [id], onDelete: Restrict)

  @@index([employeeId, confirmedAt])
  @@index([skillDefinitionId, confirmedAt])
  @@map("current_skill_confirmations")
}
```

### Evaluation

```prisma
model Evaluation {
  id                    String                    @id @default(cuid())
  employeeId            String
  storeId               String
  evaluatorId           String?
  evaluatorAccountId    String?
  evaluatorRoleSnapshot AccountRole?
  roundId               String
  evaluationPeriod      String?
  evaluationStatus      EvaluationStatus
  scoringVersion        String                    @default("legacy-v0")
  employeeTypeSnapshot  EmployeeType
  scoringPolicySnapshot Json
  attitudeScore         Int?
  attendanceScore       Int?
  skillScore            Int?
  pressureHandlingScore Int?
  teamworkScore         Int?
  executionScore        Int?
  serviceQualityScore   Int?
  growthPotentialScore  Int?
  manualWeightedScore   Decimal?                  @db.Decimal(5, 2)
  textReview            String                    @default("")
  aiTextScore           Int?
  aiRiskScore           Int?
  riskLevel             RiskLevel?
  finalScore            Decimal?                  @db.Decimal(5, 2)
  grade                 Grade?
  speedRating           Int?
  initiativeRating      Int?
  attitudeRating        Int?
  availabilityRating    Int?
  skillScoreV1          Decimal?                  @db.Decimal(5, 2)
  speedScoreV1          Decimal?                  @db.Decimal(5, 2)
  initiativeScoreV1     Decimal?                  @db.Decimal(5, 2)
  attitudeScoreV1       Decimal?                  @db.Decimal(5, 2)
  availabilityScoreV1   Decimal?                  @db.Decimal(5, 2)
  textScoreV1           Decimal?                  @db.Decimal(5, 2)
  overallScoreV1        Decimal?                  @db.Decimal(5, 2)
  tierV1                TierV1?
  skillCoverageV1       Decimal?                  @db.Decimal(5, 4)
  textFeedback          String?
  textScoreSourceV1     V1TextScoreSource?
  selectedAiRunId       String?
  employeeNameSnapshot  String?
  employeeRoleSnapshot  String?
  storeNameSnapshot     String?
  evaluatorNameSnapshot String?
  version               Int                       @default(0)
  createdAt             DateTime                  @default(now())
  updatedAt             DateTime                  @updatedAt
  completedAt           DateTime?
  submittedAt           DateTime?
  employee              Employee                  @relation(fields: [employeeId], references: [id], onDelete: Restrict)
  store                 Store                     @relation(fields: [storeId], references: [id], onDelete: Restrict)
  evaluatorAccount      UserAccount?              @relation("EvaluationEvaluatorAccount", fields: [evaluatorAccountId], references: [id], onDelete: SetNull)
  round                 EvaluationRound           @relation(fields: [roundId, employeeId, storeId], references: [id, employeeId, storeId], onDelete: Restrict)
  skillSnapshots        EvaluationSkillSnapshot[]
  v1AiRuns              EvaluationAiRun[]

  @@unique([employeeId, storeId, evaluationPeriod])
  @@unique([roundId, evaluatorAccountId])
  @@index([storeId])
  @@index([employeeId])
  @@index([evaluatorAccountId])
  @@index([roundId, evaluationStatus, completedAt])
  @@index([evaluationPeriod])
  @@index([evaluationStatus])
  @@index([riskLevel])
  @@index([finalScore])
  @@index([storeId, evaluationPeriod])
  @@index([employeeId, evaluationPeriod])
  @@index([scoringVersion, evaluationStatus, completedAt])
  // PostgreSQL truncated these historical SQL index names to 63 bytes.
  @@index([storeId, scoringVersion, evaluationStatus, completedAt], map: "evaluations_storeId_scoringVersion_evaluationStatus_completedAt")
  @@index([employeeId, scoringVersion, evaluationStatus, completedAt], map: "evaluations_employeeId_scoringVersion_evaluationStatus_complete")
  @@map("evaluations")
}
```

### EvaluationSkillSnapshot

```prisma
model EvaluationSkillSnapshot {
  id                String      @id @default(cuid())
  evaluationId      String
  skillDefinitionId String?
  skillCode         String
  skillNameZh       String
  skillNameEn       String
  category          String
  skillMode         SkillMode   @default(PROGRESSIVE)
  status            SkillStatus
  statusFactor      Decimal     @db.Decimal(5, 4)
  weight            Decimal     @db.Decimal(6, 3)
  contribution      Decimal     @db.Decimal(8, 4)
  createdAt         DateTime    @default(now())
  evaluation        Evaluation  @relation(fields: [evaluationId], references: [id], onDelete: Cascade)

  @@unique([evaluationId, skillCode])
  @@index([evaluationId])
  @@map("evaluation_skill_snapshots")
}
```

### EvaluationAiRun

```prisma
model EvaluationAiRun {
  id                   String                 @id @default(cuid())
  evaluationId         String
  status               EvaluationAiRunStatus
  provider             String
  model                String
  textFeedbackSnapshot String
  textScore            Decimal                @db.Decimal(5, 2)
  rawResponse          Json?
  errorMessage         String?
  createdAt            DateTime               @default(now())
  completedAt          DateTime               @default(now())
  evaluation           Evaluation             @relation(fields: [evaluationId], references: [id], onDelete: Cascade)
  evidence             EvaluationAiEvidence[]

  @@index([evaluationId, createdAt])
  @@index([status])
  @@map("evaluation_ai_runs")
}
```

### EvaluationAiEvidence

```prisma
model EvaluationAiEvidence {
  id         String                   @id @default(cuid())
  aiRunId    String
  type       EvaluationAiEvidenceType
  dimension  String?
  skillCode  String?
  message    String
  confidence Decimal?                 @db.Decimal(5, 4)
  createdAt  DateTime                 @default(now())
  aiRun      EvaluationAiRun          @relation(fields: [aiRunId], references: [id], onDelete: Cascade)

  @@index([aiRunId, type])
  @@map("evaluation_ai_evidence")
}
```

### AiAnalysisRun

```prisma
model AiAnalysisRun {
  id                  String   @id @default(cuid())
  employeeId          String
  storeId             String
  evaluationPeriod    String
  evaluationId        String?
  triggeredByUserId   String?
  provider            String
  model               String
  status              String
  textReviewSnapshot  String
  includedRecentNotes Boolean  @default(false)
  recentNotesCount    Int      @default(0)
  aiTextScore         Int?
  aiRiskScore         Int?
  summary             String?
  strengths           Json?
  improvementAreas    Json?
  dimensionSignals    Json?
  errorMessage        String?
  latencyMs           Int?
  createdAt           DateTime @default(now())
  employee            Employee @relation(fields: [employeeId], references: [id], onDelete: Restrict)
  store               Store    @relation(fields: [storeId], references: [id], onDelete: Restrict)

  @@index([employeeId])
  @@index([storeId])
  @@index([evaluationId])
  @@index([evaluationPeriod])
  @@index([status])
  @@index([createdAt])
  @@index([employeeId, storeId, evaluationPeriod])
  @@map("ai_analysis_runs")
}
```

### PerformanceNote

```prisma
model PerformanceNote {
  id          String              @id @default(cuid())
  employeeId  String
  storeId     String
  authorId    String?
  noteDate    DateTime            @default(now())
  noteType    PerformanceNoteType
  dimensions  String[]            @default([])
  scoreImpact Int?
  noteText    String
  createdAt   DateTime            @default(now())
  updatedAt   DateTime            @updatedAt
  employee    Employee            @relation(fields: [employeeId], references: [id], onDelete: Restrict)
  store       Store               @relation(fields: [storeId], references: [id], onDelete: Restrict)

  @@index([employeeId])
  @@index([storeId])
  @@index([noteType])
  @@index([noteDate])
  @@index([storeId, noteDate])
  @@index([employeeId, noteDate])
  @@map("performance_notes")
}
```
