import { Chat } from "chat";
import { createSendblueAdapter } from "chat-adapter-sendblue";
import { createRedisState } from "@chat-adapter/state-redis";

const bot = new Chat({
  userName: "caltext",
  adapters: {
    sendblue: createSendblueAdapter(),
  },
  state: createRedisState(),
}).registerSingleton();

export default bot;
