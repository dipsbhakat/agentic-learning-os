import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { getOrCreateUser } from "@/lib/student-model";

interface ClerkUserEvent {
  type: string;
  data: {
    id: string;
    primary_email_address_id: string | null;
    email_addresses: Array<{ id: string; email_address: string }>;
  };
}

export async function POST(request: Request) {
  const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "CLERK_WEBHOOK_SECRET is not set." }, { status: 500 });
  }

  const payload = await request.text();
  const headerList = await headers();
  const svixHeaders = {
    "svix-id": headerList.get("svix-id") ?? "",
    "svix-timestamp": headerList.get("svix-timestamp") ?? "",
    "svix-signature": headerList.get("svix-signature") ?? "",
  };

  let event: ClerkUserEvent;
  try {
    event = new Webhook(webhookSecret).verify(payload, svixHeaders) as ClerkUserEvent;
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
  }

  if (event.type === "user.created" || event.type === "user.updated") {
    const primaryEmail = event.data.email_addresses.find(
      (address) => address.id === event.data.primary_email_address_id,
    );
    if (primaryEmail) {
      await getOrCreateUser(event.data.id, primaryEmail.email_address);
    }
  }

  return NextResponse.json({ received: true });
}
