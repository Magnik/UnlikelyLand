-- CreateTable
CREATE TABLE "MailMessage" (
    "id" TEXT NOT NULL,
    "senderCharacterId" TEXT NOT NULL,
    "recipientCharacterId" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "deletedBySender" BOOLEAN NOT NULL DEFAULT false,
    "deletedByRecipient" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MailMessage_recipientCharacterId_createdAt_idx" ON "MailMessage"("recipientCharacterId", "createdAt");

-- CreateIndex
CREATE INDEX "MailMessage_senderCharacterId_createdAt_idx" ON "MailMessage"("senderCharacterId", "createdAt");

-- AddForeignKey
ALTER TABLE "MailMessage" ADD CONSTRAINT "MailMessage_senderCharacterId_fkey" FOREIGN KEY ("senderCharacterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailMessage" ADD CONSTRAINT "MailMessage_recipientCharacterId_fkey" FOREIGN KEY ("recipientCharacterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

