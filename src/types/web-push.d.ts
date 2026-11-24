declare module "web-push" {
  const webpush: {
    generateVAPIDKeys(): { publicKey: string; privateKey: string };
    setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
    sendNotification(sub: { endpoint: string; keys: { p256dh: string; auth: string } }, payload: string, options?: { TTL?: number; urgency?: string; topic?: string }): Promise<unknown>;
  };
  export default webpush;
}
