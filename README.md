# Covey.Town

Covey.Town provides a virtual meeting space where different groups of people can have simultaneous video calls, allowing participants to drift between different conversations, just like in real life.
Covey.Town was built for Northeastern's [Spring 2021 software engineering course](https://neu-se.github.io/CS4530-CS5500-Spring-2021/), and is designed to be reused across semesters.
You can view our reference deployment of the app at [app.covey.town](https://app.covey.town/), and our project showcase ([Spring 2022](https://neu-se.github.io/CS4530-Spring-2022/assignments/project-showcase), [Spring 2021](https://neu-se.github.io/CS4530-CS5500-Spring-2021/project-showcase)) highlight select student projects.

![Covey.Town Architecture](docs/covey-town-architecture.png)

The figure above depicts the high-level architecture of Covey.Town.
The frontend client (in the `frontend` directory of this repository) uses the [PhaserJS Game Library](https://phaser.io) to create a 2D game interface, using tilemaps and sprites.
The frontend implements video chat using the [Twilio Programmable Video](https://www.twilio.com/docs/video) API, and that aspect of the interface relies heavily on [Twilio's React Starter App](https://github.com/twilio/twilio-video-app-react). Twilio's React Starter App is packaged and reused under the Apache License, 2.0.

A backend service (in the `townService` directory) implements the application logic: tracking which "towns" are available to be joined, and the state of each of those towns.

## Running this app locally

Running the application locally entails running both the backend service and a frontend.

### Setting up the backend

To run the backend, you will need a Twilio account. Twilio provides new accounts with $15 of credit, which is more than enough to get started.
To create an account and configure your local environment:

1. Go to [Twilio](https://www.twilio.com/) and create an account. You do not need to provide a credit card to create a trial account.
2. Create an API key and secret (select "API Keys" on the left under "Settings")
3. Create a `.env` file in the `townService` directory, setting the values as follows:

| Config Value            | Description                               |
| ----------------------- | ----------------------------------------- |
| `TWILIO_ACCOUNT_SID`    | Visible on your twilio account dashboard. |
| `TWILIO_API_KEY_SID`    | The SID of the new API key you created.   |
| `TWILIO_API_KEY_SECRET` | The secret for the API key you created.   |
| `TWILIO_API_AUTH_TOKEN` | Visible on your twilio account dashboard. |

### Starting the backend

Once your backend is configured, you can start it by running `npm start` in the `townService` directory (the first time you run it, you will also need to run `npm install`).
The backend will automatically restart if you change any of the files in the `townService/src` directory.

### Configuring the frontend

Create a `.env` file in the `frontend` directory, with the line: `REACT_APP_TOWNS_SERVICE_URL=http://localhost:8081` (if you deploy the towns service to another location, put that location here instead)

### Running the frontend

In the `frontend` directory, run `npm start` (again, you'll need to run `npm install` the very first time). After several moments (or minutes, depending on the speed of your machine), a browser will open with the frontend running locally.
The frontend will automatically re-compile and reload in your browser if you change any files in the `frontend/src` directory.

## Team 310 Feature Addition

### Feature Overview

** insert information about our feature **

### Events

#### Client to Server Events

- teleportRequest: (request: TeleportRequest) => void;
  - Event emitted when ourPlayer requests to teleport to another player.
  - Sent to Server to relay to other Clients.
- teleportCanceled: (request: TeleportRequest) => void;
  - Event emitted when ourPlayer cancels their request to another player.
  - Sent to Server to relay to other Clients.
- teleportAccepted: (request: TeleportRequest) => void;
  - Event emitted when ourPlayer accepts the request of another player.
  - Sent to Server to relay to other Clients.
- teleportDenied: (request: TeleportRequest) => void;
  - Event emitted when ourPlayer denies the request of another player.
  - Sent to Server to relay to other Clients.
- teleportTimeout: (request: TeleportRequest) => void;
  - Event emitted when the outgoing teleport timer reaches 0. This means that the requested player did not respond in time.
  - Sent to Server to relay to other Clients.
- doNotDisturbChange: (state: boolean) => void;
  - Event emitted when ourPlayer changes their do not disturb state.
  - Sent to Server to relay to other Clients.
- outgoingTeleportTimerChange: (state: number | undefined) => void;
  - Event emitted when ourPlayer's outgoing teleport timer changes.
  - This event is emitted when the timer is added (when ourPlayer requests to teleport to another player), when the timer is removed (due to the request being cancelled, accepted, or denied), or when the timer is decremented (a second passes since the timer started).
  - Sent to Server to relay to other Clients.
- teleportSuccess: (request: TeleportRequest) => void;
  - Event emitted when ourPlayer successfully teleports to another.
  - Sent to Server to relay to other Clients.
- teleportFailed: (request: TeleportRequest) => void;
  - Event emitted when ourPlayer's teleport request or teleport fails at any point during the process.
  - Sent to Server to relay to other Clients.

#### Server to Client Events

- teleportRequest: (request: TeleportRequest) => void;
  - Relays the teleport request to other Clients so the requested player's frontend can update appropriately.
- teleportCanceled: (request: TeleportRequest) => void;
  - Relays the teleport cancelled event to other Clients so the requested player's frontend can update appropriately.
- teleportAccepted: (request: TeleportRequest) => void;
  - Relays the teleport accepted event to other Clients so the requesting player's frontend can update appropriately.
- teleportDenied: (request: TeleportRequest) => void;
  - Relays the teleport denied event to other Clients so the requesting player's frontend can update appropriately.
- teleportTimeout: (request: TeleportRequest) => void;
  - Relays the teleport timeout event to other Clients so the requested player's frontend can update appropriately.
- doNotDisturbChange: (playerInfo: DoNotDisturbInfo) => void;
  - Relays the do not disturb change event to other Clients so all other frontend displays can update appropriately.
- outgoingTeleportTimerChange: (playerInfo: OutgoingTeleportTimerInfo) => void;
  - Relays the teleport timer change event to other Clients so the requested player's frontend can update the timer value appropriately.
- teleportSuccess: (request: TeleportRequest) => void;
  - Relays the teleport success event to other Clients so the requested or requesting player's frontend can update appropriately.
- teleportFailed: (request: TeleportRequest) => void;
  - Relays the teleport failed event to other Clients so the requested or requesting player's frontend can update appropriately.

#### Town Events

- teleportTimeout: (request: TeleportRequest) => void;
  - An event that indicates that a player's teleport request has timed out.
  - Emitted 30 seconds after the initial teleport request.
  - Upon teleportTimeout, the player is notified via a toast that the teleport has timed-out.
- teleportSuccess: (request: TeleportRequest) => void;
  - An event that indicates that a player has successfully teleported to another player.
  - Emitted when ourPlayer successfully teleported to another or another player successfully teleported to ourPlayer.
  - Upon teleportSuccess, the player is notified via a toast.
- teleportFailed: (request: TeleportRequest) => void;
  - An event that indicates that a player has failed to teleport to another player.
  - Emitted when ourPlayer failed to teleport to another or another player failed to teleport to ourPlayer.
  - Upon teleportFailed, the player is notified via a toast.
- incomingTeleportTimerChange: (state: OutgoingTeleportTimerInfo) => void;
  - An event that indicates that another player's outgoing teleport timer has changed.
  - Emitted when a timer related to one of ourPlayer's incoming teleports is changed.
  - Upon incomingTeleportTimerChange, the request notification is re-rendered with the new timer value.

#### Player Events

- outgoingTeleportChange: (newRequest: TeleportRequest | PreviousTeleportRequestStatus) => void;
  - An event that indicates that this player's outgoing teleport request has changed
  - Either indicates the PreviousTeleportRequestStatus -- why the previous teleport was removed -- or the current outgoing teleport request.
  - Upon outgoingTeleportChange, the player's request buttons are updated and a toast providing information about the change is displayed (if the request was accepted, denied, or timed-out).
- incomingTeleportsChange: (newIncomingList: TeleportRequest[]) => void;
  - An event that indicates that this player's incoming teleport requests have changed.
  - Emitted when an incoming teleport is added or removed.
  - Upon incomingTeleportsChange, the request notification list is re-rendered with the updated request information.
- doNotDisturbChange: (newValue: boolean) => void;
  - An event that indicates that this player's do not disturb status has changed.
  - Upon doNotDisturbChange, the players' teleport request options are updated appropriately.
- outgoingTeleportTimerChange: (newValue: number | undefined) => void;
  - An event that indicates that this player's outgoing teleport request timer has changed.
  - Upon outgoingTeleportTimerChange, the page is re-rendered with the updated timer value.
