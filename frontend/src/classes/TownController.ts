import assert from 'assert';
import EventEmitter from 'events';
import _ from 'lodash';
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import TypedEmitter from 'typed-emitter';
import Interactable from '../components/Town/Interactable';
import ViewingArea from '../components/Town/interactables/ViewingArea';
import { LoginController } from '../contexts/LoginControllerContext';
import { TownsService, TownsServiceClient } from '../generated/client';
import useTownController from '../hooks/useTownController';
import {
  ChatMessage,
  CoveyTownSocket,
  PlayerLocation,
  TeleportRequest,
  TownSettingsUpdate,
  ViewingArea as ViewingAreaModel,
} from '../types/CoveyTownSocket';
import {
  isConversationArea,
  isViewingArea,
  PreviousTeleportRequestStatus,
} from '../types/TypeUtils';
import ConversationAreaController from './ConversationAreaController';
import PlayerController from './PlayerController';
import ViewingAreaController from './ViewingAreaController';

const CALCULATE_NEARBY_PLAYERS_DELAY = 300;

export type ConnectionProperties = {
  userName: string;
  townID: string;
  loginController: LoginController;
};

/**
 * The TownController emits these events. Components may subscribe to these events
 * by calling the `addListener` method on a TownController
 */
export type TownEvents = {
  /**
   * An event that indicates that the TownController is now connected to the townService
   * @param providerVideoToken a secret token that can be used to connect to the video service
   */
  connect: (providerVideoToken: string) => void;
  /**
   * An event that indicates that the TownController has been disconnected from the townService
   */
  disconnect: () => void;
  /**
   * An event that indicates that the town settings have been updated. This event is dispatched
   * before updating the properties of this TownController; clients may find the new settings in the parameter
   */
  townSettingsUpdated: (newTownSettings: TownSettingsUpdate) => void;
  /**
   * An event that indicates that the set of players in the town has changed. This event is dispatched
   * before updating the proeprties of this TownController; clients will find the new players in the parameter
   */
  playersChanged: (newPlayers: PlayerController[]) => void;
  /**
   * An event that indicates that a player has moved. This event is dispatched after updating the player's location -
   * the new location can be found on the PlayerController.
   */
  playerMoved: (movedPlayer: PlayerController) => void;
  /**
   * An event that indicates that the set of conversation areas has changed. This event is dispatched
   * when a conversation area is created, or when the set of active conversations has changed. This event is dispatched
   * after updating the town controller's record of conversation areas.
   */
  conversationAreasChanged: (currentConversationAreas: ConversationAreaController[]) => void;
  /**
   * An event that indicates that the set of viewing areas has changed. This event is emitted after updating
   * the town controller's record of viewing areas.
   */
  viewingAreasChanged: (newViewingAreas: ViewingAreaController[]) => void;
  /**
   * An event that indicates that a new chat message has been received, which is the parameter passed to the listener
   */
  chatMessage: (message: ChatMessage) => void;
  /**
   * An event that indicates that the 2D game is now paused. Pausing the game should, if nothing else,
   * release all key listeners, so that text entry is possible
   */
  pause: () => void;
  /**
   * An event that indicates that the 2D game should now be unpaused (resumed).
   */
  unPause: () => void;
  /**
   * An event that indicates that the player is now interacting with a different interactable
   * @param typeName the type of interactable
   * @param obj the interactable that is being interacted with
   */
  interact: <T extends Interactable>(typeName: T['name'], obj: T) => void;
  /**
   * An event that indicates that a player has requested to teleport to a different player.  This event is emitted
   * when a player clicks the teleport request button.
   */
  teleportRequest: (request: TeleportRequest) => void;
  /**
   * An event that indicates that a player has cancled their request to teleport to a different player. This event
   * is emitted when a player clicks the cancel teleport button.
   */
  teleportCanceled: (request: TeleportRequest) => void;
  /**
   * An event that indicates that a player has accepted a teleport request from a different player. This event is
   * emitted when the player clicks the accept button on the teleport accept display.
   */
  teleportAccepted: (request: TeleportRequest) => void;
  /**
   * An event that indicates that a player has denied a teleport request from a different player. This event is
   * emitted when the player clicks the denied button on the teleport accept display, or when the player does not respond
   * within 30 seconds.
   */
  teleportDenied: (request: TeleportRequest) => void;
  /**
   * An event that indicates that a player has successfully teleported to another player. This event is
   * emitted in the teleportAccepted listener if the 'from' player teleported to the 'to' player.
   */
  teleportSuccess: (request: TeleportRequest) => void;
  /**
   * An event that indicates that a player has failed to teleport to another player. This event is
   * emitted in the teleportAccepted listener if the 'from' player for some reason could not teleport to
   * or find the location of the 'to' player.
   */
  teleportFailed: (request: TeleportRequest) => void;
  /**
   * An event that indicates that a player has toggled their do not disturb mode. This event is
   * emitted when the player clicks the do not disturb button next to their name.
   */
  doNotDisturbChange: (state: boolean) => void;
  /**
   * An event that indicates that a player's outgoing teleport timer has changed. This event is
   * emitted when the method handling timer incrementing runs.
   */
  outgoingTeleportTimerChange: (state: number | undefined) => void;
};

/**
 * The (frontend) TownController manages the communication between the frontend
 * and the backend. When a player join a town, a new TownController is created,
 * and frontend components can register to receive events (@see CoveyTownEvents).
 *
 * To access the TownController from a React component, use the
 * useTownController hook (@see useTownController). While the town controller
 * can be directly used by React components, it is generally preferable to use the various hooks
 * defined in this file (e.g. @see usePlayers, @see useConversationAreas), which will automatically
 * subscribe to updates to their respective data, triggering the React component that consumes them
 * to re-render when the underlying data changes.
 *
 */
export default class TownController extends (EventEmitter as new () => TypedEmitter<TownEvents>) {
  /** The socket connection to the townsService. Messages emitted here
   * are received by the TownController in that service.
   */
  private _socket: CoveyTownSocket;

  /**
   * The REST API client to access the townsService
   */
  private _townsService: TownsService;

  /**
   * The login controller is used by the frontend application to manage logging in to a town,
   * and is also used to log out of a town.
   */
  private _loginController: LoginController;

  /**
   * The current list of players in the town. Adding or removing players might replace the array
   * with a new one; clients should take note not to retain stale references.
   */
  private _playersInternal: PlayerController[] = [];

  /**
   * The current list of conversation areas in the twon. Adding or removing conversation areas might
   * replace the array with a new one; clients should take note not to retain stale references.
   */
  private _conversationAreasInternal: ConversationAreaController[] = [];

  /**
   * The friendly name of the current town, set only once this TownController is connected to the townsService
   */
  private _friendlyNameInternal?: string;

  /**
   * The town ID of the current town, generated by the backend townsService and used to uniquely identify this town with the
   * server and other players
   */
  private readonly _townID: string;

  /**
   * If true, then this town's friendlyName and townID are included in the public listing of active towns.
   * Changes to this variable do not influence the behavior of the server, it must be changed through the townsService API client
   */
  private _townIsPubliclyListedInternal = false;

  /**
   * The username of the player whose browser created this TownController
   */
  private readonly _userName: string;

  /**
   * The user ID of the player whose browser created this TownController. The user ID is set by the backend townsService, and
   * is only available after the service is connected.
   */
  private _userID?: string;

  /**
   * A reference to the Player object that represents the player whose browser created this TownController.
   */
  private _ourPlayer?: PlayerController;

  /**
   * A secret token that is provided by the townsService when we connect, and is needed
   * for authenticating future API calls as being from the same user who created this TownController.
   */
  private _sessionToken?: string;

  /**
   * A secret token that is provided by the townsService when we connect, and can be used to connect
   * to a third-party video conferecing service.
   */
  private _providerVideoToken?: string;

  /**
   * A flag indicating whether the current 2D game is paused, or not. Pausing the game will prevent it from updating,
   * and will also release any key bindings, allowing all keys to be used for text entry or other purposes.
   */
  private _paused = false;

  /**
   * An event emitter that broadcasts interactable-specific events
   */
  private _interactableEmitter = new EventEmitter();

  private _viewingAreas: ViewingAreaController[] = [];

  private _ourPlayerOutgoingTeleportTimerInterval: NodeJS.Timer | undefined;

  private _ourPlayerOutgoingTeleportTimerValue = 0;

  public constructor({ userName, townID, loginController }: ConnectionProperties) {
    super();
    this._townID = townID;
    this._userName = userName;
    this._loginController = loginController;

    /*
        The event emitter will show a warning if more than this number of listeners are registered, as it
        may indicate a leak (listeners that should de-register not de-registering). The default is 10; we expect
        more than 10 listeners because each conversation area might be its own listener, and there are more than 10
        */
    this.setMaxListeners(30);

    const url = process.env.REACT_APP_TOWNS_SERVICE_URL;
    assert(url);
    this._socket = io(url, { auth: { userName, townID } });
    this._townsService = new TownsServiceClient({ BASE: url }).towns;
    this.registerSocketListeners();
  }

  public get sessionToken() {
    return this._sessionToken || '';
  }

  public get userID() {
    const id = this._userID;
    assert(id);
    return id;
  }

  public get townIsPubliclyListed() {
    return this._townIsPubliclyListedInternal;
  }

  private set _townIsPubliclyListed(newSetting: boolean) {
    this._townIsPubliclyListedInternal = newSetting;
    this.emit('townSettingsUpdated', { isPubliclyListed: newSetting });
  }

  public get providerVideoToken() {
    const token = this._providerVideoToken;
    assert(token);
    return token;
  }

  public get userName() {
    return this._userName;
  }

  public get friendlyName() {
    const friendlyName = this._friendlyNameInternal;
    assert(friendlyName);
    return friendlyName;
  }

  private set _friendlyName(newFriendlyName: string) {
    this._friendlyNameInternal = newFriendlyName;
    this.emit('townSettingsUpdated', { friendlyName: newFriendlyName });
  }

  public get paused() {
    return this._paused;
  }

  public get ourPlayer() {
    const ret = this._ourPlayer;
    assert(ret);
    return ret;
  }

  public get townID() {
    return this._townID;
  }

  public pause(): void {
    if (!this._paused) {
      this._paused = true;
      this.emit('pause');
    }
  }

  public unPause(): void {
    if (this._paused) {
      this._paused = false;
      this.emit('unPause');
    }
  }

  public get players(): PlayerController[] {
    return this._playersInternal;
  }

  private set _players(newPlayers: PlayerController[]) {
    this.emit('playersChanged', newPlayers);
    this._playersInternal = newPlayers;
  }

  public get conversationAreas() {
    return this._conversationAreasInternal;
  }

  private set _conversationAreas(newConversationAreas: ConversationAreaController[]) {
    this._conversationAreasInternal = newConversationAreas;
    this.emit('conversationAreasChanged', newConversationAreas);
  }

  public get interactableEmitter() {
    return this._interactableEmitter;
  }

  public get viewingAreas() {
    return this._viewingAreas;
  }

  public set viewingAreas(newViewingAreas: ViewingAreaController[]) {
    this._viewingAreas = newViewingAreas;
    this.emit('viewingAreasChanged', newViewingAreas);
  }

  /**
   * Begin interacting with an interactable object. Emits an event to all listeners.
   * @param interactedObj
   */
  public interact<T extends Interactable>(interactedObj: T) {
    this._interactableEmitter.emit(interactedObj.getType(), interactedObj);
  }

  /**
   * End interacting with an interactable object. Emits an event to all listeners.
   * @param objectNoLongerInteracting
   */
  public interactEnd(objectNoLongerInteracting: Interactable) {
    this._interactableEmitter.emit('endInteraction', objectNoLongerInteracting);
  }

  private _teleportOurPlayerTo(otherPlayerLocation: PlayerLocation) {
    const gameObjects = this.ourPlayer.gameObjects;
    const newLocation = otherPlayerLocation;
    if (!gameObjects) {
      throw new Error('Unable to move player without game objects created first');
    }
    if (otherPlayerLocation.x !== undefined) {
      gameObjects.sprite.x = otherPlayerLocation.x;
      newLocation.x = otherPlayerLocation.x;
    }
    if (otherPlayerLocation.y !== undefined) {
      gameObjects.sprite.y = otherPlayerLocation.y;
      newLocation.y = otherPlayerLocation.y;
    }
    if (otherPlayerLocation.moving !== undefined) {
      newLocation.moving = otherPlayerLocation.moving;
    }
    if (otherPlayerLocation.rotation !== undefined) {
      newLocation.rotation = otherPlayerLocation.rotation;
    }
    this.emitMovement(newLocation);
  }

  /**
   * Registers listeners for the events that can come from the server to our socket
   */
  registerSocketListeners() {
    /**
     * On chat messages, forward the messages to listeners who subscribe to the controller's events
     */
    this._socket.on('chatMessage', message => {
      this.emit('chatMessage', message);
    });
    /**
     * On changes to town settings, update the local state and emit a townSettingsUpdated event to
     * the controller's event listeners
     */
    this._socket.on('townSettingsUpdated', update => {
      const newFriendlyName = update.friendlyName;
      if (newFriendlyName !== undefined) {
        this._friendlyName = newFriendlyName;
      }
      if (update.isPubliclyListed !== undefined) {
        this._townIsPubliclyListed = update.isPubliclyListed;
      }
    });
    /**
     * On town closing events, emit a disconnect message to the controller's event listeners, and
     * return to the login screen
     */
    this._socket.on('townClosing', () => {
      this.emit('disconnect');
      this._loginController.setTownController(null);
    });
    /**
     * When a new player joins the town, update our local state of players in the town and notify
     * the controller's event listeners that the player has moved to their starting location.
     *
     * Note that setting the players array will also emit an event that the players in the town have changed.
     */
    this._socket.on('playerJoined', newPlayer => {
      const newPlayerObj = PlayerController.fromPlayerModel(newPlayer);
      this._players = this.players.concat([newPlayerObj]);
      this.emit('playerMoved', newPlayerObj);
    });
    /**
     * When a player disconnects from the town, update local state
     *
     * Note that setting the players array will also emit an event that the players in the town have changed.
     */
    this._socket.on('playerDisconnect', disconnectedPlayer => {
      this._players = this.players.filter(eachPlayer => eachPlayer.id !== disconnectedPlayer.id);
    });
    /**
     * When a player moves, update local state and emit an event to the controller's event listeners
     */
    this._socket.on('playerMoved', movedPlayer => {
      const playerToUpdate = this.players.find(eachPlayer => eachPlayer.id === movedPlayer.id);
      if (playerToUpdate) {
        if (playerToUpdate === this._ourPlayer) {
          /*
           * If we are told that WE moved, we shouldn't update our x,y because it's probably lagging behind
           * real time. However: we SHOULD update our interactable ID, because its value is managed by the server
           */
          playerToUpdate.location.interactableID = movedPlayer.location.interactableID;
        } else {
          playerToUpdate.location = movedPlayer.location;
        }
        this.emit('playerMoved', playerToUpdate);
      } else {
        //TODO: It should not be possible to receive a playerMoved event for a player that is not already in the players array, right?
        const newPlayer = PlayerController.fromPlayerModel(movedPlayer);
        this._players = this.players.concat(newPlayer);
        this.emit('playerMoved', newPlayer);
      }
    });
    /**
     * When an interactable's state changes, push that update into the relevant controller, which is assumed
     * to be either a Viewing Area or a Conversation Area, and which is assumed to already be represented by a
     * ViewingAreaController or ConversationAreaController that this TownController has.
     *
     * If a conversation area transitions from empty to occupied (or occupied to empty), this handler will emit
     * a conversationAreasChagned event to listeners of this TownController.
     *
     * If the update changes properties of the interactable, the interactable is also expected to emit its own
     * events (@see ViewingAreaController and @see ConversationAreaController)
     */
    this._socket.on('interactableUpdate', interactable => {
      if (isConversationArea(interactable)) {
        const updatedConversationArea = this.conversationAreas.find(c => c.id === interactable.id);
        if (updatedConversationArea) {
          const emptyNow = updatedConversationArea.isEmpty();
          updatedConversationArea.topic = interactable.topic;
          updatedConversationArea.occupants = this._playersByIDs(interactable.occupantsByID);
          const emptyAfterChange = updatedConversationArea.isEmpty();
          if (emptyNow !== emptyAfterChange) {
            this.emit('conversationAreasChanged', this._conversationAreasInternal);
          }
        }
      } else if (isViewingArea(interactable)) {
        const updatedViewingArea = this._viewingAreas.find(
          eachArea => eachArea.id === interactable.id,
        );
        updatedViewingArea?.updateFrom(interactable);
      }
    });
    /**
     * When a teleport is requested from a player, check if the request is to our player. If it is, update our player's
     * request list.
     */
    this._socket.on('teleportRequest', request => {
      if (request.toPlayerId === this.ourPlayer.id) {
        this.ourPlayer.addIncomingTeleport(request);
      }
    });
    /**
     * When a teleport is canceled from a player, check if the request is to our player. If it is, update our player's
     * request list.
     */
    this._socket.on('teleportCanceled', request => {
      if (request.toPlayerId === this.ourPlayer.id) {
        this.ourPlayer.removeIncomingTeleport(request);
      }
    });
    /**
     * When a teleport is accepted from a player, check if the request is from our player. If it is, update our player's
     * request list and update the location of our player to the location of the other player.
     */
    this._socket.on('teleportAccepted', request => {
      try {
        const currentRequest: TeleportRequest = this.ourPlayer.outgoingTeleport as TeleportRequest;
        if (
          request.fromPlayerId === this.ourPlayer.id &&
          request.toPlayerId === currentRequest.toPlayerId
        ) {
          const otherPlayer = this.players.filter(player => player.id === request.toPlayerId);
          this.ourPlayer.outgoingTeleport = PreviousTeleportRequestStatus.Accepted;
          if (otherPlayer.length === 1) {
            this._teleportOurPlayerTo(otherPlayer[0].location);
            this._socket.emit('teleportSuccess', request);
          } else {
            this._socket.emit('teleportFailed', request);
          }
        }
      } catch (e) {
        this._socket.emit('teleportFailed', request);
      }
    });

    /**
     * When a teleport is denied from a player, check if the request is from our player. If it is, update our player's
     * request list.
     */
    this._socket.on('teleportDenied', request => {
      try {
        const currentRequest: TeleportRequest = this.ourPlayer.outgoingTeleport as TeleportRequest;
        if (
          request.fromPlayerId === this.ourPlayer.id &&
          request.toPlayerId === currentRequest.toPlayerId
        ) {
          this.ourPlayer.outgoingTeleport = PreviousTeleportRequestStatus.Denied;
        }
      } catch (e) {
        // Do nothing, request already cleared on our end
      }
    });
    /**
     * When a teleport is sucessful, check if the request had to do with our player. If it does, perform
     * some sort of UI display indicating that the teleport was sucessful.
     */
    this._socket.on('teleportSuccess', request => {
      if (request.fromPlayerId === this.ourPlayer.id || request.toPlayerId === this.ourPlayer.id) {
        //TODO: Notify the user that the teleport was successful
      }
    });
    /**
     * When a teleport fails, check if the request had to do with our player. If it does, perform
     * some sort of UI display indicating that the teleport failed.
     */
    this._socket.on('teleportFailed', request => {
      if (request.fromPlayerId === this.ourPlayer.id || request.toPlayerId === this.ourPlayer.id) {
        //TODO: Notify the user that the teleport failed
        //We have a couple of cases here that we need to figure out
        //1) We requested to teleport and the other player's id was not in our local session
        //2) The other player accepted the teleport and the other player is not in our local session to find location of
        //3) The other player attempted to accept the teleport but could not since teleport was not in their incoming list
        //4) The other player attempted to deny the teleport but could not since teleport was not in their incoming list
      }
    });

    /**
     * When do not disturb mode is toggled, update our players do not disturb status
     */
    this._socket.on('doNotDisturbChange', playerInfo => {
      this._players = this.players.map(player => {
        if (playerInfo.playerId === player.id && playerInfo.playerId !== this.ourPlayer.id) {
          player.doNotDisturb = playerInfo.state;
          return player;
        }
        return player;
      });
    });

    /**
     * When outgoing teleport timer changes, update our player's timer status
     */
    this._socket.on('outgoingTeleportTimerChange', playerInfo => {
      this._players = this.players.map(player => {
        if (playerInfo.playerId === player.id && playerInfo.playerId !== this.ourPlayer.id) {
          player.outgoingTeleportTimer = playerInfo.state;
          return player;
        }
        return player;
      });
    });
  }

  /**
   * Emit a movement event for the current player, updating the state locally and
   * also notifying the townService that our player moved.
   *
   * Note: it is the responsibility of the townService to set the 'interactableID' parameter
   * of the player's location, and any interactableID set here may be overwritten by the townService
   *
   * @param newLocation
   */
  public emitMovement(newLocation: PlayerLocation) {
    this._socket.emit('playerMovement', newLocation);
    const ourPlayer = this._ourPlayer;
    assert(ourPlayer);
    ourPlayer.location = newLocation;
    this.emit('playerMoved', ourPlayer);
  }

  /**
   * Emit a chat message to the townService
   *
   * @param message
   */
  public emitChatMessage(message: ChatMessage) {
    this._socket.emit('chatMessage', message);
  }

  /**
   * Emit a teleport request to the townService
   * @param toPlayerId the player being requested
   */
  public emitTeleportRequest(toPlayerId: string) {
    const request = {
      fromPlayerId: this.ourPlayer.id,
      toPlayerId: toPlayerId,
      time: new Date(),
    };
    if (this._playerInSession(toPlayerId)) {
      this.ourPlayer.outgoingTeleport = request;
      this._socket.emit('teleportRequest', request);
    } else {
      this._socket.emit('teleportFailed', request);
    }
  }

  /**
   * Emit a teleport canceled to the townService
   * @param toPlayerId the player being requested
   */
  public emitTeleportCanceled(toPlayerId: string) {
    const request = this.ourPlayer.outgoingTeleport;
    if (typeof request !== 'string' && request.toPlayerId === toPlayerId) {
      this._socket.emit('teleportCanceled', request);
      this.ourPlayer.outgoingTeleport = PreviousTeleportRequestStatus.Cancelled;
    }
  }

  /**
   * Emit a teleport accepted to the townService if the request is in our player's incomingTeleportsList
   * @param request the request being accepted
   */
  public emitTeleportAccepted(request: TeleportRequest) {
    if (this.ourPlayer.incomingTeleports.indexOf(request) !== -1) {
      this.ourPlayer.removeIncomingTeleport(request);
      this._socket.emit('teleportAccepted', request);
    } else {
      this._socket.emit('teleportFailed', request);
    }
  }

  /**
   * Emit a teleport denied to the townService if the request is in our player's incomingTeleportsList
   * @param request the request being denied
   */
  public emitTeleportDenied(request: TeleportRequest) {
    if (this.ourPlayer.incomingTeleports.indexOf(request) !== -1) {
      this.ourPlayer.removeIncomingTeleport(request);
      this._socket.emit('teleportDenied', request);
    } else {
      this._socket.emit('teleportFailed', request);
    }
  }

  /**
   * Emit a do not disturb change to the townService
   */
  public emitDoNotDisturbChange() {
    this._socket.emit('doNotDisturbChange', !this.ourPlayer.doNotDisturb);
    this.ourPlayer.doNotDisturb = !this.ourPlayer.doNotDisturb;
  }

  /**
   * Emit a outgoing teleport timer change to the townService
   * @param newValue the new timer value
   */
  public emitOutgoingTeleportTimerChange(newValue: number | undefined) {
    if (!newValue) {
      this.emitTeleportCanceled(this.ourPlayer.id);
      this._socket.emit('outgoingTeleportTimerChange', undefined);
      this.ourPlayer.outgoingTeleportTimer = undefined;
      if (this._ourPlayerOutgoingTeleportTimerInterval) {
        clearInterval(this._ourPlayerOutgoingTeleportTimerInterval);
      }
    } else {
      this._socket.emit('outgoingTeleportTimerChange', newValue);
      this.ourPlayer.outgoingTeleportTimer = newValue;
    }
  }

  /**
   * Start the outgoing teleport timer
   * @param startValue the total time
   */
  public startOutgoingTeleportTimer(startValue: number) {
    this._ourPlayerOutgoingTeleportTimerInterval = setInterval(() => {
      this._ourPlayerOutgoingTeleportTimerValue -= 1;
      this.emitOutgoingTeleportTimerChange(this._ourPlayerOutgoingTeleportTimerValue);
      console.log(this._ourPlayerOutgoingTeleportTimerValue);
    }, 1000);

    this._ourPlayerOutgoingTeleportTimerValue = startValue;
    this.emitOutgoingTeleportTimerChange(startValue);
  }

  /**
   * Checks to see if a player with the given id is in the session
   * @param playerId the playerId to check
   * @returns boolean representing if the player is in the session
   */
  private _playerInSession(playerId: string): boolean {
    return this._playersByIDs([playerId]).length === 1;
  }

  /**
   * Update the settings of the current town. Sends the request to update the settings to the townService,
   * and does not update the local model. If the update is successful, then the townService will inform us
   * of the updated settings. Throws an error if the request is not successful.
   *
   * @param roomUpdatePassword
   * @param updatedSettings
   */
  async updateTown(
    roomUpdatePassword: string,
    updatedSettings: { isPubliclyListed: boolean; friendlyName: string },
  ) {
    await this._townsService.updateTown(this._townID, roomUpdatePassword, updatedSettings);
  }

  /**
   * Delete the current town. Sends the request to the townService, and sends an error if the request is
   * not successful
   *
   * @param roomUpdatePassword
   */
  async deleteTown(roomUpdatePassword: string) {
    await this._townsService.deleteTown(this._townID, roomUpdatePassword);
  }

  /**
   * Create a new conversation area, sending the request to the townService. Throws an error if the request
   * is not successful. Does not immediately update local state about the new conversation area - it will be
   * updated once the townService creates the area and emits an interactableUpdate
   *
   * @param newArea
   */
  async createConversationArea(newArea: {
    topic?: string;
    id: string;
    occupantsByID: Array<string>;
  }) {
    await this._townsService.createConversationArea(this.townID, this.sessionToken, newArea);
  }

  /**
   * Create a new viewing area, sending the request to the townService. Throws an error if the request
   * is not successful. Does not immediately update local state about the new viewing area - it will be
   * updated once the townService creates the area and emits an interactableUpdate
   *
   * @param newArea
   */
  async createViewingArea(newArea: ViewingAreaModel) {
    await this._townsService.createViewingArea(this.townID, this.sessionToken, newArea);
  }

  /**
   * Disconnect from the town, notifying the townService that we are leaving and returning
   * to the login page
   */
  public disconnect() {
    this._clearTeleports();
    this._socket.disconnect();
    this._loginController.setTownController(null);
  }

  /**
   * When disconnecting from the town, clear all the teleports for our player. Decline all incoming
   * and cancel the outgoing if needed.
   */
  private _clearTeleports(): void {
    const inList = this.ourPlayer.incomingTeleports;
    inList.forEach(request => this.emitTeleportDenied(request));
    if (typeof this.ourPlayer.outgoingTeleport !== 'string') {
      const outRequest: TeleportRequest = this.ourPlayer.outgoingTeleport as TeleportRequest;
      this.emitTeleportCanceled(outRequest.toPlayerId);
    }
  }

  /**
   * Connect to the townService. Throws an error if it is unable to connect
   * @returns
   */
  public async connect() {
    /*
         The connection is only valid if we receive an 'initialize' callback, and is invalid if the disconnect
         handler is called. Wrap the return of connect in a promise that is resolved upon initialize or rejected
         upon disconnect.
         */
    return new Promise<void>((resolve, reject) => {
      this._socket.connect();
      this._socket.on('initialize', initialData => {
        this._providerVideoToken = initialData.providerVideoToken;
        this._friendlyNameInternal = initialData.friendlyName;
        this._townIsPubliclyListedInternal = initialData.isPubliclyListed;
        this._sessionToken = initialData.sessionToken;
        this._players = initialData.currentPlayers.map(eachPlayerModel =>
          PlayerController.fromPlayerModel(eachPlayerModel),
        );

        this._conversationAreas = [];
        this._viewingAreas = [];
        initialData.interactables.forEach(eachInteractable => {
          if (isConversationArea(eachInteractable)) {
            this._conversationAreasInternal.push(
              ConversationAreaController.fromConversationAreaModel(
                eachInteractable,
                this._playersByIDs.bind(this),
              ),
            );
          } else if (isViewingArea(eachInteractable)) {
            this._viewingAreas.push(new ViewingAreaController(eachInteractable));
          }
        });
        this._userID = initialData.userID;
        this._ourPlayer = this.players.find(eachPlayer => eachPlayer.id == this.userID);
        this.emit('connect', initialData.providerVideoToken);
        resolve();
      });
      this._socket.on('disconnect', () => {
        reject(new Error('Invalid town ID'));
      });
    });
  }

  /**
   * Retrieve the viewing area controller that corresponds to a viewingAreaModel, creating one if necessary
   *
   * @param viewingArea
   * @returns
   */
  public getViewingAreaController(viewingArea: ViewingArea): ViewingAreaController {
    const existingController = this._viewingAreas.find(
      eachExistingArea => eachExistingArea.id === viewingArea.name,
    );
    if (existingController) {
      return existingController;
    } else {
      const newController = new ViewingAreaController({
        elapsedTimeSec: 0,
        id: viewingArea.name,
        isPlaying: false,
        video: viewingArea.defaultVideoURL,
      });
      this._viewingAreas.push(newController);
      return newController;
    }
  }

  /**
   * Emit a viewing area update to the townService
   * @param viewingArea The Viewing Area Controller that is updated and should be emitted
   *    with the event
   */
  public emitViewingAreaUpdate(viewingArea: ViewingAreaController) {
    this._socket.emit('interactableUpdate', viewingArea.viewingAreaModel());
  }

  /**
   * Determine which players are "nearby" -- that they should be included in our video call
   */
  public nearbyPlayers(): PlayerController[] {
    const isNearby = (p: PlayerController) => {
      if (p.location && this.ourPlayer.location) {
        if (this.ourPlayer.location.interactableID || p.location.interactableID) {
          return p.location.interactableID === this.ourPlayer.location.interactableID;
        }
        const dx = p.location.x - this.ourPlayer.location.x;
        const dy = p.location.y - this.ourPlayer.location.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        return d < 80;
      }
      return false;
    };
    return this.players.filter(p => isNearby(p));
  }

  private _playersByIDs(playerIDs: string[]): PlayerController[] {
    return this._playersInternal.filter(eachPlayer => playerIDs.includes(eachPlayer.id));
  }
}

/**
 * A react hook to retrieve the settings for this town
 *
 * This hook will cause components that use it to re-render when the settings change.
 *
 * This hook relies on the TownControllerContext.
 * @returns an object with the properties "friendlyName" and "isPubliclyListed",
 *  representing the current settings of the current town
 */
export function useTownSettings() {
  const townController = useTownController();
  const [friendlyName, setFriendlyName] = useState<string>(townController.friendlyName);
  const [isPubliclyListed, setIsPubliclyListed] = useState<boolean>(
    townController.townIsPubliclyListed,
  );
  useEffect(() => {
    const updateTownSettings = (update: TownSettingsUpdate) => {
      const newName = update.friendlyName;
      const newPublicSetting = update.isPubliclyListed;
      if (newName !== undefined) {
        setFriendlyName(newName);
      }
      if (newPublicSetting !== undefined) {
        setIsPubliclyListed(newPublicSetting);
      }
    };
    townController.addListener('townSettingsUpdated', updateTownSettings);
    return () => {
      townController.removeListener('townSettingsUpdated', updateTownSettings);
    };
  }, [townController]);
  return { friendlyName, isPubliclyListed };
}

/**
 * A react hook to retrieve a viewing area controller.
 *
 * This function will throw an error if the viewing area controller does not exist.
 *
 * This hook relies on the TownControllerContext.
 *
 * @param viewingAreaID The ID of the viewing area to retrieve the controller for
 *
 * @throws Error if there is no viewing area controller matching the specifeid ID
 */
export function useViewingAreaController(viewingAreaID: string): ViewingAreaController {
  const townController = useTownController();

  const viewingArea = townController.viewingAreas.find(eachArea => eachArea.id == viewingAreaID);
  if (!viewingArea) {
    throw new Error(`Requested viewing area ${viewingAreaID} does not exist`);
  }
  return viewingArea;
}

/**
 * A react hook to retrieve the active conversation areas. This hook will re-render any components
 * that use it when the set of conversation areas changes. It does *not* re-render its dependent components
 * when the state of one of those areas changes - if that is desired, @see useConversationAreaTopic and @see useConversationAreaOccupants
 *
 * This hook relies on the TownControllerContext.
 *
 * @returns the list of conversation area controllers that are currently "active"
 */
export function useActiveConversationAreas(): ConversationAreaController[] {
  const townController = useTownController();
  const [conversationAreas, setConversationAreas] = useState<ConversationAreaController[]>(
    townController.conversationAreas.filter(eachArea => !eachArea.isEmpty()),
  );
  useEffect(() => {
    const updater = (allAreas: ConversationAreaController[]) => {
      setConversationAreas(allAreas.filter(eachArea => !eachArea.isEmpty()));
    };
    townController.addListener('conversationAreasChanged', updater);
    return () => {
      townController.removeListener('conversationAreasChanged', updater);
    };
  }, [townController, setConversationAreas]);
  return conversationAreas;
}

/**
 * A react hook to return the PlayerController's corresponding to each player in the town.
 *
 * This hook will cause components that use it to re-render when the set of players in the town changes.
 *
 * This hook will *not* trigger re-renders if a player moves.
 *
 * This hook relies on the TownControllerContext.
 *
 * @returns an array of PlayerController's, representing the current set of players in the town
 */
export function usePlayers(): PlayerController[] {
  const townController = useTownController();
  const [players, setPlayers] = useState<PlayerController[]>(townController.players);
  useEffect(() => {
    townController.addListener('playersChanged', setPlayers);
    return () => {
      townController.removeListener('playersChanged', setPlayers);
    };
  }, [townController, setPlayers]);
  return players;
}

function samePlayers(a1: PlayerController[], a2: PlayerController[]) {
  if (a1.length !== a2.length) return false;
  const ids1 = a1.map(p => p.id).sort();
  const ids2 = a2.map(p => p.id).sort();
  return _.isEqual(ids1, ids2);
}

/**
 * A react hook to retrieve the interactable that is *currently* be interacted with by the player in this frontend.
 * A player is "interacting" with the Interactable if they are within it, and press the spacebar.
 *
 * This hook will cause any component that uses it to re-render when the object that the player is interacting with changes.
 *
 * This hook relies on the TownControllerContext.
 *
 * @param interactableType
 */
export function useInteractable<T extends Interactable>(
  interactableType: T['name'],
): T | undefined {
  const townController = useTownController();
  const [interactable, setInteractable] = useState<T | undefined>(undefined);
  useEffect(() => {
    const onInteract = (interactWith: T) => {
      setInteractable(interactWith);
    };
    const offInteract = () => {
      setInteractable(undefined);
    };
    townController.interactableEmitter.on(interactableType, onInteract);
    townController.interactableEmitter.on('endInteraction', offInteract);

    return () => {
      townController.interactableEmitter.off(interactableType, onInteract);
      townController.interactableEmitter.off('endInteraction', offInteract);
    };
  }, [interactableType, townController, setInteractable]);
  return interactable;
}
/**
 * A react hook to retrieve the players that should be included in the video call
 *
 * This hook will cause components that  use it to re-render when the set of players in the video call changes.
 *
 * This hook relies on the TownControllerContext.
 * @returns
 */
export function usePlayersInVideoCall(): PlayerController[] {
  const townController = useTownController();
  const [playersInCall, setPlayersInCall] = useState<PlayerController[]>([]);
  useEffect(() => {
    let lastRecalculatedNearbyPlayers = 0;
    let prevNearbyPlayers: PlayerController[] = [];
    const updatePlayersInCall = () => {
      const now = Date.now();
      // To reduce re-renders, only recalculate the nearby players every so often
      if (now - lastRecalculatedNearbyPlayers > CALCULATE_NEARBY_PLAYERS_DELAY) {
        lastRecalculatedNearbyPlayers = now;
        const nearbyPlayers = townController.nearbyPlayers();
        if (!samePlayers(nearbyPlayers, prevNearbyPlayers)) {
          prevNearbyPlayers = nearbyPlayers;
          setPlayersInCall(nearbyPlayers);
        }
      }
    };
    townController.addListener('playerMoved', updatePlayersInCall);
    townController.addListener('playersChanged', updatePlayersInCall);
    updatePlayersInCall();
    return () => {
      townController.removeListener('playerMoved', updatePlayersInCall);
      townController.removeListener('playersChanged', updatePlayersInCall);
    };
  }, [townController, setPlayersInCall]);
  return playersInCall;
}
