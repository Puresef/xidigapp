import { z } from 'zod';

import { MESSAGE_MAX_LENGTH } from './constants';

/** Start a DM request (§13 request-to-chat). An optional first message becomes
 * the request preview the recipient sees before accepting. */
export const startConversationSchema = z.object({
  recipientUserId: z.string().uuid(),
  message: z.string().trim().min(1).max(MESSAGE_MAX_LENGTH).optional(),
});

/** Text, voice, or both — never neither (mirrors messages_body_or_voice). */
export const sendMessageSchema = z
  .object({
    body: z.string().trim().min(1).max(MESSAGE_MAX_LENGTH).optional(),
    voiceUploadId: z.string().uuid().optional(),
  })
  .refine((value) => value.body !== undefined || value.voiceUploadId !== undefined, {
    message: 'body or voiceUploadId required',
  });

export const respondSchema = z.object({
  action: z.enum(['accept', 'decline']),
});

export type StartConversationInput = z.infer<typeof startConversationSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type RespondInput = z.infer<typeof respondSchema>;
