// AWS adapters: evidence files in S3, invitation emails through SES.

import { S3Client, HeadObjectCommand, DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import type { Mailer, Storage } from './app.ts';

export function s3Storage(bucket: string, s3 = new S3Client({})): Storage {
  return {
    // A browser uploads straight to S3 with this form; S3 itself rejects a different size or type.
    presignUpload: (key, contentType, size) => createPresignedPost(s3, {
      Bucket: bucket, Key: key, Expires: 300,
      Conditions: [['content-length-range', size, size], ['eq', '$Content-Type', contentType]],
      Fields: { 'Content-Type': contentType },
    }),
    async head(key) {
      try {
        const h = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return { size: h.ContentLength ?? 0, contentType: h.ContentType };
      } catch (e: any) {
        if (e?.name === 'NotFound' || e?.$metadata?.httpStatusCode === 404) return null;
        throw e;
      }
    },
    presignDownload: (key, filename, contentType) => getSignedUrl(s3, new GetObjectCommand({
      Bucket: bucket, Key: key, ResponseContentType: contentType,
      ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    }), { expiresIn: 300 }),
    async delete(key) { await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })); },
    async deletePrefix(prefix) {
      let token: string | undefined;
      do {
        const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
        const objs = (page.Contents ?? []).map(o => ({ Key: o.Key! }));
        if (objs.length) await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objs, Quiet: true } }));
        token = page.NextContinuationToken;
      } while (token);
    },
  };
}

// Documents waiting to be read (inbox/<cid>/<job>), deleted once read.
export interface Inbox { read(key: string): Promise<Buffer>; delete(key: string): Promise<void>; }
export function s3Inbox(bucket: string, s3 = new S3Client({})): Inbox {
  return {
    async read(key) { const o = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key })); return Buffer.from(await o.Body!.transformToByteArray()); },
    async delete(key) { await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })); },
  };
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const ROLE_ES = { viewer: 'lector', editor: 'editor', admin: 'administrador', owner: 'propietario' } as const;

export function sesMailer(from: string, ses = new SESv2Client({})): Mailer {
  return {
    async sendInvite(to, { company, inviter, role, link }) {
      const text = `${inviter} invited you to join ${company} on CO2Trace as ${role}.\n${inviter} te invitó a ${company} en CO2Trace como ${ROLE_ES[role]}.\n\n${link}\n\nThis link expires in 14 days. / El enlace vence en 14 días.`;
      const html = `<p><b>${esc(inviter)}</b> invited you to join <b>${esc(company)}</b> on CO2Trace as <b>${role}</b>.<br>
        <b>${esc(inviter)}</b> te invitó a <b>${esc(company)}</b> en CO2Trace como <b>${ROLE_ES[role]}</b>.</p>
        <p><a href="${esc(link)}">Accept the invitation · Aceptar la invitación</a></p>
        <p style="color:#5F6F7E">This link expires in 14 days. · El enlace vence en 14 días.</p>`;
      await ses.send(new SendEmailCommand({
        FromEmailAddress: from, Destination: { ToAddresses: [to] },
        Content: { Simple: { Subject: { Data: `Join ${company} on CO2Trace · Únete a ${company} en CO2Trace` }, Body: { Text: { Data: text }, Html: { Data: html } } } },
      }));
      return true;
    },
  };
}
