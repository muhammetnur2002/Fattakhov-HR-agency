ALTER TABLE "Account" ADD COLUMN "sessionsRevokedAt" TIMESTAMP(3);
CREATE TABLE "SecurityIncident" (
 "id" TEXT NOT NULL PRIMARY KEY, "dedupeKey" TEXT NOT NULL, "kind" TEXT NOT NULL,
 "accountId" TEXT NOT NULL, "evidenceEnc" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "SecurityIncident_dedupeKey_key" ON "SecurityIncident"("dedupeKey");
CREATE INDEX "SecurityIncident_createdAt_idx" ON "SecurityIncident"("createdAt");
CREATE TABLE "SecurityDecision" (
 "id" TEXT NOT NULL PRIMARY KEY, "incidentId" TEXT NOT NULL, "operatorId" TEXT NOT NULL,
 "action" TEXT NOT NULL, "reasonEnc" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "SecurityDecision_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "SecurityIncident"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE "SecurityMail" (
 "id" TEXT NOT NULL PRIMARY KEY, "incidentId" TEXT NOT NULL, "attempts" INTEGER NOT NULL DEFAULT 0,
 "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "leaseToken" TEXT, "sentAt" TIMESTAMP(3),
 CONSTRAINT "SecurityMail_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "SecurityIncident"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SecurityMail_incidentId_key" ON "SecurityMail"("incidentId");
CREATE INDEX "SecurityMail_sentAt_availableAt_idx" ON "SecurityMail"("sentAt", "availableAt");
