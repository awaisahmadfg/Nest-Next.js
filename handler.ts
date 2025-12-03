import { sendSlackNotification } from "./slackNotifier";

export const handler = async (event: any) => {
  try {
    const { title, description, severity } = JSON.parse(event.body || "{}");

    const message = {
      text: `*New Notification*\n• *Title:* ${title}\n• *Description:* ${description}\n• *Severity:* ${severity}`,
      username: "Alert Bot",
      icon_emoji: ":rotating_light:",
    };

    await sendSlackNotification(message);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: "Notification sent to Slack" }),
    };
  } catch (error: any) {
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message }),
    };
  }
};
