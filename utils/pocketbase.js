// utils\pocketbase.js
import PocketBase from "pocketbase";

const pb = new PocketBase(process.env.POCKETBASE_URL);

let isAuthed = false;

export async function ensurePBAuth() {
  if (!isAuthed) {
    await pb.admins.authWithPassword(
      process.env.PB_ADMIN_EMAIL,
      process.env.PB_ADMIN_PASS,
    );
    isAuthed = true;
  }
}

export default pb;
