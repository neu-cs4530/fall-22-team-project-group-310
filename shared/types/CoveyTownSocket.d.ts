export type TownJoinResponse = {
  /** Unique ID that represents this player * */
  userID: string;
  /** Secret token that this player should use to authenticate
   * in future requests to this service * */
  sessionToken: string;
  /** Secret token that this player should use to authenticate
   * in future requests to the video service * */
  providerVideoToken: string;
  /** List of players currently in this town * */
  currentPlayers: Player[];
  /** Friendly name of this town * */
  friendlyName: string;
  /** Is this a private town? * */
  isPubliclyListed: boolean;
  /** Current state of interactables in this town */
  interactables: Interactable[];
};

export type Interactable = ViewingArea | ConversationArea;

export type TownSettingsUpdate = {
  friendlyName?: string;
  isPubliclyListed?: boolean;
}

export type Direction = 'front' | 'back' | 'left' | 'right';
export interface Player {
  id: string;
  userName: string;
  location: PlayerLocation;
  doNotDisturbState: boolean;
};

export type XY = { x: number, y: number };

export interface PlayerLocation {
  /* The CENTER x coordinate of this player's location */
  x: number;
  /* The CENTER y coordinate of this player's location */
  y: number;
  /** @enum {string} */
  rotation: Direction;
  moving: boolean;
  interactableID?: string;
};
export type ChatMessage = {
  author: string;
  sid: string;
  body: string;
  dateCreated: Date;
};

export interface ConversationArea {
  id: string;
  topic?: string;
  occupantsByID: string[];
};
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
};

export interface ViewingArea {
  id: string;
  video?: string;
  isPlaying: boolean;
  elapsedTimeSec: number;
}

export interface ServerToClientEvents {
  playerMoved: (movedPlayer: Player) => void;
  playerDisconnect: (disconnectedPlayer: Player) => void;
  playerJoined: (newPlayer: Player) => void;
  initialize: (initialData: TownJoinResponse) => void;
  townSettingsUpdated: (update: TownSettingsUpdate) => void;
  townClosing: () => void;
  chatMessage: (message: ChatMessage) => void;
  interactableUpdate: (interactable: Interactable) => void;
  teleportRequest: (request: TeleportRequest) => void;
  teleportCanceled: (request: TeleportRequest) => void;
  teleportAccepted: (request: TeleportRequest) => void;
  teleportDenied: (request: TeleportRequest) => void;
  teleportTimeout: (request: TeleportRequest) => void;
  doNotDisturbChange: (playerInfo: DoNotDisturbInfo) => void;
  outgoingTeleportTimerChange: (playerInfo: OutgoingTeleportTimerInfo) => void;
  teleportSuccess: (request: TeleportRequest) => void;
  teleportFailed: (request: TeleportRequest) => void;
}

export interface ClientToServerEvents {
  chatMessage: (message: ChatMessage) => void;
  playerMovement: (movementData: PlayerLocation) => void;
  interactableUpdate: (update: Interactable) => void;
  teleportRequest: (request: TeleportRequest) => void;
  teleportCanceled: (request: TeleportRequest) => void;
  teleportAccepted: (request: TeleportRequest) => void;
  teleportDenied: (request: TeleportRequest) => void;
  teleportTimeout: (request: TeleportRequest) => void;
  doNotDisturbChange: (state: boolean) => void;
  outgoingTeleportTimerChange: (state: number | undefined) => void;
  teleportSuccess: (request: TeleportRequest) => void;
  teleportFailed: (request: TeleportRequest) => void;
}

export type TeleportRequest = {
  fromPlayerId: string;
  toPlayerId: string;
  time: Date;
}

export type DoNotDisturbInfo = {
  playerId: string
  state: boolean;
}

export type OutgoingTeleportTimerInfo = {
  playerId: string
  state: number | undefined;
}