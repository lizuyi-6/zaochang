import { getChatGPTUser } from "./chatgpt-auth";
import CommunityApp from "./community-client";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getChatGPTUser();
  return (
    <CommunityApp
      member={
        user
          ? {
              signedIn: true,
              displayName: user.displayName,
              initial: (user.displayName.trim()[0] || "造").toUpperCase(),
            }
          : { signedIn: false, displayName: "游客", initial: "游" }
      }
    />
  );
}
