"use client";

import { useEveAgent } from "eve/react";

export default function ChatPage() {
  const agent = useEveAgent();
  const isBusy = agent.status === "submitted" || agent.status === "streaming";

  return (
    <div>
      <div className="chat-log">
        {agent.data.messages.map((message) => (
          <article className={`chat-message ${message.role}`} key={message.id}>
            {message.parts.map((part, index) =>
              part.type === "text" ? <p key={index}>{part.text}</p> : null,
            )}
          </article>
        ))}
      </div>
      <form
        className="chat-form"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const message = String(form.get("message") ?? "").trim();
          if (message.length > 0) {
            void agent.send({ message });
            event.currentTarget.reset();
          }
        }}
      >
        <input name="message" placeholder="Tell the Mentor what you want to learn..." disabled={isBusy} />
        <button disabled={isBusy} type="submit">
          Send
        </button>
      </form>
    </div>
  );
}
