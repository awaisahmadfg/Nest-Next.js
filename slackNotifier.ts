import axios from "axios";

const webhookUrl = process.env.SLACK_WEBHOOK_URL as string;

if (!webhookUrl) {
  throw new Error("SLACK_WEBHOOK_URL is not set in environment variables.");
}

interface SlackMessage {
  text: string;
  channel?: string;
  username?: string;
  icon_emoji?: string;
}

/**
 * Sends a message to Slack via webhook
 */
export const sendSlackNotification = async (message: SlackMessage) => {
  try {
    await axios.post(webhookUrl, message);
    console.log("Slack notification sent:", message.text);
  } catch (error: any) {
    console.error("Failed to send Slack message:", error?.message);
    throw new Error("Slack notification failed.");
  }
};
