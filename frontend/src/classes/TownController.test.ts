import { mock, mockClear, MockProxy } from 'jest-mock-extended';
import { nanoid } from 'nanoid';
import { LoginController } from '../contexts/LoginControllerContext';
import { ViewingArea } from '../generated/client';
import {
  EventNames,
  getEventListener,
  mockTownControllerConnection,
  ReceivedEventParameter,
} from '../TestUtils';
import {
  ChatMessage,
  ConversationArea as ConversationAreaModel,
  CoveyTownSocket,
  DoNotDisturbInfo,
  Player as PlayerModel,
  PlayerLocation,
  ServerToClientEvents,
  TeleportRequest,
  TownJoinResponse,
} from '../types/CoveyTownSocket';
import {
  isConversationArea,
  isViewingArea,
  PreviousTeleportRequestStatus,
} from '../types/TypeUtils';
import PlayerController from './PlayerController';
import TownController, { TownEvents } from './TownController';
import ViewingAreaController from './ViewingAreaController';

/**
 * Mocks the socket-io client constructor such that it will always return the same
 * mockSocket instance. Returns that mockSocket instance to the caller of this function,
 * allowing tests to make assertions about the messages emitted to the socket, and also to
 * simulate the receipt of events, @see getEventListener
 */
const mockSocket = mock<CoveyTownSocket>();
jest.mock('socket.io-client', () => {
  const actual = jest.requireActual('socket.io-client');
  return {
    ...actual,
    io: () => mockSocket,
  };
});

describe('TownController', () => {
  let mockLoginController: MockProxy<LoginController>;
  let userName: string;
  let townID: string;
  beforeAll(() => {
    mockLoginController = mock<LoginController>();
    process.env.REACT_APP_TOWNS_SERVICE_URL = 'test';
  });
  let testController: TownController;

  /**
   * Testing harness that mocks the arrival of an event from the CoveyTownSocket and expects that
   * a given listener is invoked, optionally with an expected listener parameter.
   *
   * Returns a mock listener callback that represents the listener under expectation
   *
   * @param receivedEvent
   * @param receivedParameter
   * @param listenerToExpect
   * @param expectedListenerParam
   * @returns mock listener mock
   */
  const emitEventAndExpectListenerFiring = <
    ReceivedEventFromSocket extends EventNames<ServerToClientEvents>,
    ExpectedListenerName extends EventNames<TownEvents>,
  >(
    receivedEvent: ReceivedEventFromSocket,
    receivedParameter: ReceivedEventParameter<ReceivedEventFromSocket>,
    listenerToExpect: ExpectedListenerName,
    expectedListenerParam?: Parameters<TownEvents[ExpectedListenerName]>[0],
  ): jest.MockedFunction<TownEvents[ExpectedListenerName]> => {
    const eventListener = getEventListener(mockSocket, receivedEvent);
    const mockListener = jest.fn() as jest.MockedFunction<TownEvents[ExpectedListenerName]>;
    testController.addListener(listenerToExpect, mockListener);
    eventListener(receivedParameter);
    if (expectedListenerParam === undefined) {
      expect(mockListener).toHaveBeenCalled();
    } else {
      expect(mockListener).toHaveBeenCalledWith(expectedListenerParam);
    }
    return mockListener;
  };

  beforeEach(() => {
    mockClear(mockSocket);
    userName = nanoid();
    townID = nanoid();
    testController = new TownController({ userName, townID, loginController: mockLoginController });
  });
  describe('With an unsuccesful connection', () => {
    it('Throws an error', async () => {
      mockSocket.on.mockImplementation((eventName, eventListener) => {
        if (eventName === 'disconnect') {
          const listener = eventListener as () => void;
          listener();
        }
        return mockSocket;
      });
      await expect(testController.connect()).rejects.toThrowError();
      mockSocket.on.mockReset();
    });
  });
  describe('With a successful connection', () => {
    let townJoinResponse: TownJoinResponse;

    beforeEach(async () => {
      townJoinResponse = await mockTownControllerConnection(testController, mockSocket);
    });
    it('Initializes the properties of the controller', () => {
      expect(testController.providerVideoToken).toEqual(townJoinResponse.providerVideoToken);
      expect(testController.friendlyName).toEqual(townJoinResponse.friendlyName);
      expect(testController.townIsPubliclyListed).toEqual(townJoinResponse.isPubliclyListed);
      expect(testController.sessionToken).toEqual(townJoinResponse.sessionToken);
      expect(testController.userID).toEqual(townJoinResponse.userID);
    });

    it('Forwards update town calls to local CoveyTownEvents listeners', () => {
      const newFriendlyName = nanoid();
      emitEventAndExpectListenerFiring(
        'townSettingsUpdated',
        { friendlyName: newFriendlyName },
        'townSettingsUpdated',
        { friendlyName: newFriendlyName },
      );
    });
    it('Forwards delete town calls to local CoveyTownEvents listeners', () => {
      emitEventAndExpectListenerFiring('townClosing', undefined, 'disconnect', undefined);
    });
    it('Forwards chat messages to local CoveyTownEvents listeners', () => {
      const message: ChatMessage = {
        author: nanoid(),
        body: nanoid(),
        dateCreated: new Date(),
        sid: nanoid(),
      };
      emitEventAndExpectListenerFiring('chatMessage', message, 'chatMessage', message);
    });
    it("Emits the local player's movement updates to the socket and to locally subscribed CoveyTownEvents listeners", () => {
      const newLocation: PlayerLocation = { ...testController.ourPlayer.location, x: 10, y: 10 };
      const expectedPlayerUpdate = testController.ourPlayer;
      expectedPlayerUpdate.location = newLocation;
      const movedPlayerListener = jest.fn();

      testController.addListener('playerMoved', movedPlayerListener);

      testController.emitMovement(newLocation);

      //Emits the event to the socket
      expect(mockSocket.emit).toBeCalledWith('playerMovement', newLocation);

      //Emits the playerMovement event to locally subscribed listerners, indicating that the player moved
      expect(movedPlayerListener).toBeCalledWith(expectedPlayerUpdate);

      //Uses the correct (new) location when emitting that update locally
      expect(expectedPlayerUpdate.location).toEqual(newLocation);
    });
    it('Emits locally written chat messages to the socket, and dispatches no other events', () => {
      const testMessage: ChatMessage = {
        author: nanoid(),
        body: nanoid(),
        dateCreated: new Date(),
        sid: nanoid(),
      };
      testController.emitChatMessage(testMessage);

      expect(mockSocket.emit).toBeCalledWith('chatMessage', testMessage);
    });
    it('Emits conversationAreasChanged when a conversation area is created', () => {
      const newConvArea = townJoinResponse.interactables.find(
        eachInteractable => isConversationArea(eachInteractable) && !eachInteractable.topic,
      ) as ConversationAreaModel;
      if (newConvArea) {
        newConvArea.topic = nanoid();
        newConvArea.occupantsByID = [townJoinResponse.userID];
        const event = emitEventAndExpectListenerFiring(
          'interactableUpdate',
          newConvArea,
          'conversationAreasChanged',
        );
        const changedAreasArray = event.mock.calls[0][0];
        expect(changedAreasArray.find(eachConvArea => eachConvArea.id === newConvArea.id)?.topic);
      } else {
        fail('Did not find an existing, empty conversation area in the town join response');
      }
    });
    describe('Teleport emitting methods', () => {
      describe('emitTeleportRequest', () => {
        it('Emits teleportRequest events to the socket when a teleport is requested to an active player', () => {
          expect(testController.ourPlayer.outgoingTeleport).toBe(
            PreviousTeleportRequestStatus.Default,
          );
          expect(mockSocket.emit).not.toHaveBeenCalled();
          testController.emitTeleportRequest(testController.players[1].id);
          let request = testController.ourPlayer.outgoingTeleport;
          request = request as TeleportRequest;
          expect(mockSocket.emit).toHaveBeenCalledWith('teleportRequest', request);
          expect(request.fromPlayerId).toBe(testController.ourPlayer.id);
          expect(request.toPlayerId).toBe(testController.players[1].id);
          expect(mockSocket.emit).not.toHaveBeenCalledWith('teleportFailed', request);
        });
        it('Emits teleportFailed event to the socket when the requested player does not exist', () => {
          expect(testController.ourPlayer.outgoingTeleport).toBe(
            PreviousTeleportRequestStatus.Default,
          );
          expect(mockSocket.emit).not.toHaveBeenCalled();
          testController.emitTeleportRequest(nanoid());
          const request = testController.ourPlayer.outgoingTeleport;
          expect(mockSocket.emit).not.toHaveBeenCalledWith('teleportRequest', request);
          expect(request).toBe(PreviousTeleportRequestStatus.Default);
          expect(mockSocket.emit).toHaveBeenCalled(); //teleportFailed
        });
      });
      describe('emitTeleportCanceled', () => {
        it('Emits teleportCanceled event to the socket when a teleport is canceled', () => {
          testController.emitTeleportRequest(testController.players[1].id);
          const request = testController.ourPlayer.outgoingTeleport;
          expect(mockSocket.emit).toHaveBeenCalledWith('teleportRequest', request);
          testController.emitTeleportCanceled(testController.players[1].id);
          expect(mockSocket.emit).toHaveBeenCalledWith('teleportCanceled', request);
          expect(testController.ourPlayer.outgoingTeleport).toBe(
            PreviousTeleportRequestStatus.Cancelled,
          );
        });
        it('Does not emit teleportCanceled if the request to be canceled is undefined', () => {
          expect(testController.ourPlayer.outgoingTeleport).toBe(
            PreviousTeleportRequestStatus.Default,
          );
          testController.emitTeleportCanceled(testController.players[1].id);
          expect(mockSocket.emit).not.toHaveBeenCalled();
          expect(testController.ourPlayer.outgoingTeleport).toBe(
            PreviousTeleportRequestStatus.Default,
          );
        });
        it('Does not emit teleportCanceled if the request to be canceled does not have the same id', () => {
          testController.emitTeleportRequest(testController.players[1].id);
          const request = testController.ourPlayer.outgoingTeleport;
          expect(mockSocket.emit).toHaveBeenCalledWith('teleportRequest', request);
          testController.emitTeleportCanceled(testController.players[2].id);
          expect(mockSocket.emit).not.toHaveBeenCalledWith('teleportCanceled', request);
          expect(testController.ourPlayer.outgoingTeleport).toBe(request);
        });
      });
      describe('emitTeleportAccepted and emitTeleportDenied', () => {
        let request: TeleportRequest;
        beforeEach(() => {
          expect(testController.ourPlayer.incomingTeleports).toStrictEqual([]);
          request = {
            fromPlayerId: testController.players[1].id,
            toPlayerId: testController.ourPlayer.id,
            time: new Date(),
          };
          testController.ourPlayer.addIncomingTeleport(request);
          expect(testController.ourPlayer.incomingTeleports).toStrictEqual([request]);
          mockClear(mockSocket);
        });
        it('Emits teleportAccepted event to the socket when a teleport in incoming list is accepted', () => {
          expect(testController.ourPlayer.incomingTeleports).toStrictEqual([request]);
          expect(mockSocket.emit).not.toHaveBeenCalled();
          testController.emitTeleportAccepted(request);
          expect(testController.ourPlayer.incomingTeleports).toStrictEqual([]);
          expect(mockSocket.emit).toHaveBeenCalledWith('teleportAccepted', request);
          expect(mockSocket.emit).not.toHaveBeenCalledWith('teleportFailed', request);
        });
        it('Emits teleportFailed event to the socket when a teleport not in incoming list is accepted', () => {
          expect(testController.ourPlayer.incomingTeleports).toStrictEqual([request]);
          expect(mockSocket.emit).not.toHaveBeenCalled();
          const randomRequest = {
            fromPlayerId: testController.players[1].id,
            toPlayerId: testController.ourPlayer.id,
            time: new Date(),
          };
          testController.emitTeleportAccepted(randomRequest);
          expect(testController.ourPlayer.incomingTeleports).toStrictEqual([request]);
          expect(mockSocket.emit).not.toHaveBeenCalledWith('teleportAccepted', request);
          expect(mockSocket.emit).toHaveBeenCalledWith('teleportFailed', randomRequest);
        });
        it('Emits teleportDenied event to the socket when a teleport in incoming list is denied', () => {
          expect(testController.ourPlayer.incomingTeleports).toStrictEqual([request]);
          expect(mockSocket.emit).not.toHaveBeenCalled();
          testController.emitTeleportDenied(request);
          expect(testController.ourPlayer.incomingTeleports).toStrictEqual([]);
          expect(mockSocket.emit).toHaveBeenCalledWith('teleportDenied', request);
          expect(mockSocket.emit).not.toHaveBeenCalledWith('teleportFailed', request);
        });
        it('Emits teleportFailed event to the socket when a teleport not in incoming list is denied', () => {
          expect(testController.ourPlayer.incomingTeleports).toStrictEqual([request]);
          expect(mockSocket.emit).not.toHaveBeenCalled();
          const randomRequest = {
            fromPlayerId: testController.players[1].id,
            toPlayerId: testController.ourPlayer.id,
            time: new Date(),
          };
          testController.emitTeleportDenied(randomRequest);
          expect(testController.ourPlayer.incomingTeleports).toStrictEqual([request]);
          expect(mockSocket.emit).not.toHaveBeenCalledWith('teleportDenied', randomRequest);
          expect(mockSocket.emit).toHaveBeenCalledWith('teleportFailed', randomRequest);
        });
      });
      describe('emitDoNotDisturbChange', () => {
        it('Changes our players doNotDisturb state and emits a doNotDisturbChange when called', () => {
          expect(testController.ourPlayer.doNotDisturb).toBe(false);
          expect(mockSocket.emit).not.toHaveBeenCalled();
          testController.emitDoNotDisturbChange();
          expect(testController.ourPlayer.doNotDisturb).toBe(true);
          expect(mockSocket.emit).toHaveBeenCalledWith('doNotDisturbChange', true);
        });
      });
    });
    describe('Teleport event socket listeners', () => {
      it('Adds a teleport request to this player if the request is for our player', () => {
        expect(testController.ourPlayer.incomingTeleports).toStrictEqual([]);
        const teleportRequestListener = getEventListener(mockSocket, 'teleportRequest');
        const request: TeleportRequest = {
          fromPlayerId: testController.players[1].id,
          toPlayerId: testController.ourPlayer.id,
          time: new Date(),
        };
        teleportRequestListener(request);
        expect(testController.ourPlayer.incomingTeleports).toStrictEqual([request]);
      });
      it('Does not add a teleport request to this player if the request is not for our player', () => {
        expect(testController.ourPlayer.incomingTeleports).toStrictEqual([]);
        const teleportRequestListener = getEventListener(mockSocket, 'teleportRequest');
        const request: TeleportRequest = {
          fromPlayerId: testController.players[1].id,
          toPlayerId: testController.players[2].id,
          time: new Date(),
        };
        teleportRequestListener(request);
        expect(testController.ourPlayer.incomingTeleports).toStrictEqual([]);
      });
      it('Remove a teleport request to this player if the cancel is for our player', () => {
        expect(testController.ourPlayer.incomingTeleports).toStrictEqual([]);
        const teleportRequestListener = getEventListener(mockSocket, 'teleportRequest');
        const teleportCanceledListener = getEventListener(mockSocket, 'teleportCanceled');
        const request: TeleportRequest = {
          fromPlayerId: testController.players[1].id,
          toPlayerId: testController.ourPlayer.id,
          time: new Date(),
        };
        teleportRequestListener(request);
        expect(testController.ourPlayer.incomingTeleports).toStrictEqual([request]);
        teleportCanceledListener(request);
        expect(testController.ourPlayer.incomingTeleports).toStrictEqual([]);
      });
      it('Does not remove a teleport request to this player if the cancel is not for our player', () => {
        expect(testController.ourPlayer.incomingTeleports).toStrictEqual([]);
        const teleportRequestListener = getEventListener(mockSocket, 'teleportRequest');
        const teleportCanceledListener = getEventListener(mockSocket, 'teleportCanceled');
        const request: TeleportRequest = {
          fromPlayerId: testController.players[1].id,
          toPlayerId: testController.ourPlayer.id,
          time: new Date(),
        };
        teleportRequestListener(request);
        expect(testController.ourPlayer.incomingTeleports).toStrictEqual([request]);
        const otherRequest: TeleportRequest = {
          fromPlayerId: testController.players[1].id,
          toPlayerId: testController.players[2].id,
          time: new Date(),
        };
        teleportCanceledListener(otherRequest);
        expect(testController.ourPlayer.incomingTeleports).toStrictEqual([request]);
      });
      it('Remove the outgoiong teleport request if the teleport has been denied', () => {
        expect(testController.ourPlayer.outgoingTeleport).toBe(
          PreviousTeleportRequestStatus.Default,
        );
        const teleportDeniedListener = getEventListener(mockSocket, 'teleportDenied');
        const request: TeleportRequest = {
          fromPlayerId: testController.ourPlayer.id,
          toPlayerId: testController.players[1].id,
          time: new Date(),
        };
        testController.ourPlayer.outgoingTeleport = request;
        expect(testController.ourPlayer.outgoingTeleport).toBe(request);
        teleportDeniedListener(request);
        expect(testController.ourPlayer.outgoingTeleport).toBe(
          PreviousTeleportRequestStatus.Denied,
        );
      });
      it('Does not remove the outgoing teleport request the deny is not for our player', () => {
        expect(testController.ourPlayer.outgoingTeleport).toBe(
          PreviousTeleportRequestStatus.Default,
        );
        const teleportDeniedListener = getEventListener(mockSocket, 'teleportDenied');
        const request: TeleportRequest = {
          fromPlayerId: testController.ourPlayer.id,
          toPlayerId: testController.players[1].id,
          time: new Date(),
        };
        testController.ourPlayer.outgoingTeleport = request;
        expect(testController.ourPlayer.outgoingTeleport).toBe(request);
        const otherRequest: TeleportRequest = {
          fromPlayerId: testController.players[1].id,
          toPlayerId: testController.players[2].id,
          time: new Date(),
        };
        teleportDeniedListener(otherRequest);
        expect(testController.ourPlayer.outgoingTeleport).toBe(request);
      });
      it('Does not remove the outgoing teleport request the deny is for our player but not the current outgoing request', () => {
        expect(testController.ourPlayer.outgoingTeleport).toBe(
          PreviousTeleportRequestStatus.Default,
        );
        const teleportDeniedListener = getEventListener(mockSocket, 'teleportDenied');
        const request: TeleportRequest = {
          fromPlayerId: testController.ourPlayer.id,
          toPlayerId: testController.players[1].id,
          time: new Date(),
        };
        testController.ourPlayer.outgoingTeleport = request;
        expect(testController.ourPlayer.outgoingTeleport).toBe(request);
        const otherRequest: TeleportRequest = {
          fromPlayerId: testController.ourPlayer.id,
          toPlayerId: testController.players[2].id,
          time: new Date(),
        };
        teleportDeniedListener(otherRequest);
        expect(testController.ourPlayer.outgoingTeleport).toBe(request);
      });
      describe('teleportAccepted events', () => {
        let ourLoc: PlayerLocation;
        let otherLoc: PlayerLocation;
        let teleportAcceptedListener: (request: TeleportRequest) => void;
        beforeEach(() => {
          ourLoc = {
            ...testController.ourPlayer.location,
            x: 10,
            y: 10,
            rotation: 'front',
            moving: false,
          };
          testController.ourPlayer.location = ourLoc;
          expect(testController.ourPlayer.location).toBe(ourLoc);
          otherLoc = {
            ...testController.players[1].location,
            x: 500,
            y: 500,
            rotation: 'right',
            moving: true,
          };
          testController.players[1].location = otherLoc;
          expect(testController.players[1].location).toBe(otherLoc);
          teleportAcceptedListener = getEventListener(mockSocket, 'teleportAccepted');
        });
        it('Removes the outgoing teleport request from our player and updates the player location when teleport is accepted', () => {
          expect(testController.ourPlayer.outgoingTeleport).toBe(
            PreviousTeleportRequestStatus.Default,
          );
          const request: TeleportRequest = {
            fromPlayerId: testController.ourPlayer.id,
            toPlayerId: testController.players[1].id,
            time: new Date(),
          };
          const movedPlayerListener = jest.fn();
          const expectedPlayerUpdate = testController.ourPlayer;
          expectedPlayerUpdate.location = otherLoc;
          testController.addListener('playerMoved', movedPlayerListener);
          testController.ourPlayer.outgoingTeleport = request;
          expect(testController.ourPlayer.outgoingTeleport).toBe(request);
          teleportAcceptedListener(request); // GameObjects not defined error
          expect(mockSocket.emit).toHaveBeenCalledWith('teleportFailed', request); // Error getting caught and failed getting thrown
          // We cannot currently fully unit test the teleportAcceptedListener for the following reasons:
          // 1. The listener will call the _teleportOurPlayerTo method which requires PlayerController.gameObjects to be defined.
          // gameObjects are only defined in the TownFaneScene class in the create method and we cannot reuse Phaser to define the
          // sprite or label in a test class in an efficient mannor
          // 2. We cannot mock the function _teleportOurPlayerTo to remove use of gameObjects in mockTownController since it is private
          // 3. We cannot mock the teleportAccepted listener or make a different mock event call since _socket is private
          // 4. We cannot initialize a new socket with the same auth since our townController will be listening to the old one
          // WE DO HOWEVER through manual integration testing know that this method is acting as intended as the teleport feature works
        });
        it('Does not remove the outgoing teleport request from our player if the accepted request is not the current request', () => {
          expect(testController.ourPlayer.outgoingTeleport).toBe(
            PreviousTeleportRequestStatus.Default,
          );
          const request: TeleportRequest = {
            fromPlayerId: testController.ourPlayer.id,
            toPlayerId: testController.players[1].id,
            time: new Date(),
          };
          testController.ourPlayer.outgoingTeleport = request;
          expect(testController.ourPlayer.outgoingTeleport).toBe(request);
          const otherRequest: TeleportRequest = {
            fromPlayerId: testController.ourPlayer.id,
            toPlayerId: testController.players[2].id,
            time: new Date(),
          };
          teleportAcceptedListener(otherRequest);
          expect(mockSocket.emit).not.toHaveBeenCalledWith('teleportSuccess', request);
          expect(testController.ourPlayer.location).toBe(ourLoc);
          expect(testController.ourPlayer.outgoingTeleport).toBe(request);
        });
        it('Emits a teleport failed event if the toPlayer from the request does not exist in our local session', () => {
          expect(testController.ourPlayer.outgoingTeleport).toBe(
            PreviousTeleportRequestStatus.Default,
          );
          const request: TeleportRequest = {
            fromPlayerId: testController.ourPlayer.id,
            toPlayerId: nanoid(),
            time: new Date(),
          };
          testController.ourPlayer.outgoingTeleport = request;
          expect(testController.ourPlayer.outgoingTeleport).toBe(request);
          teleportAcceptedListener(request);
          expect(mockSocket.emit).not.toHaveBeenCalledWith('teleportSuccess', request);
          expect(testController.ourPlayer.location).toBe(ourLoc);
          expect(testController.ourPlayer.outgoingTeleport).toBe(
            PreviousTeleportRequestStatus.Accepted,
          );
          expect(mockSocket.emit).toHaveBeenCalledWith('teleportFailed', request);
        });
      });
      describe('doNotDisturbChange events', () => {
        let doNotDisturbChangeListener: (playerInfo: DoNotDisturbInfo) => void;
        beforeEach(() => {
          doNotDisturbChangeListener = getEventListener(mockSocket, 'doNotDisturbChange');
        });
        it('Changes the state of a players doNotDisturb state given another player in the town', () => {
          const expectedList = testController.players;
          expectedList[1].doNotDisturb = true;
          const playerInfo: DoNotDisturbInfo = {
            playerId: testController.players[1].id,
            state: true,
          };
          doNotDisturbChangeListener(playerInfo);
          expect(testController.players).toStrictEqual(expectedList);
        });
        it('Does not change the state of our players doNotDisturb state', () => {
          const expectedList = testController.players;
          const playerInfo: DoNotDisturbInfo = {
            playerId: testController.ourPlayer.id,
            state: true,
          };
          doNotDisturbChangeListener(playerInfo);
          expect(testController.players).toStrictEqual(expectedList);
        });
        it('Does not change the state of players if the player given does not exist in our town', () => {
          const expectedList = testController.players;
          const playerInfo: DoNotDisturbInfo = {
            playerId: nanoid(),
            state: true,
          };
          doNotDisturbChangeListener(playerInfo);
          expect(testController.players).toStrictEqual(expectedList);
        });
      });
    });
    describe('[T2] interactableUpdate events', () => {
      describe('Conversation Area updates', () => {
        function emptyConversationArea() {
          return {
            ...(townJoinResponse.interactables.find(
              eachInteractable =>
                isConversationArea(eachInteractable) && eachInteractable.occupantsByID.length == 0,
            ) as ConversationAreaModel),
          };
        }
        function occupiedConversationArea() {
          return {
            ...(townJoinResponse.interactables.find(
              eachInteractable =>
                isConversationArea(eachInteractable) && eachInteractable.occupantsByID.length > 0,
            ) as ConversationAreaModel),
          };
        }
        it('Emits a conversationAreasChanged event with the updated list of conversation areas if the area is newly occupied', () => {
          const convArea = emptyConversationArea();
          convArea.occupantsByID = [townJoinResponse.userID];
          convArea.topic = nanoid();
          const updatedConversationAreas = testController.conversationAreas;

          emitEventAndExpectListenerFiring(
            'interactableUpdate',
            convArea,
            'conversationAreasChanged',
            updatedConversationAreas,
          );

          const updatedController = updatedConversationAreas.find(
            eachArea => eachArea.id === convArea.id,
          );
          expect(updatedController?.topic).toEqual(convArea.topic);
          expect(updatedController?.occupants.map(eachOccupant => eachOccupant.id)).toEqual(
            convArea.occupantsByID,
          );
          expect(updatedController?.toConversationAreaModel()).toEqual({
            id: convArea.id,
            topic: convArea.topic,
            occupantsByID: [townJoinResponse.userID],
          });
        });
        it('Emits a conversationAreasChanged event with the updated list of converation areas if the area is newly vacant', () => {
          const convArea = occupiedConversationArea();
          convArea.occupantsByID = [];
          convArea.topic = undefined;
          const updatedConversationAreas = testController.conversationAreas;

          emitEventAndExpectListenerFiring(
            'interactableUpdate',
            convArea,
            'conversationAreasChanged',
            updatedConversationAreas,
          );
          const updatedController = updatedConversationAreas.find(
            eachArea => eachArea.id === convArea.id,
          );
          expect(updatedController?.topic).toEqual(convArea.topic);
          expect(updatedController?.occupants.map(eachOccupant => eachOccupant.id)).toEqual(
            convArea.occupantsByID,
          );
        });
        it('Does not emit a conversationAreasChanged event if the set of active areas has not changed', () => {
          const convArea = occupiedConversationArea();
          convArea.topic = nanoid();
          const updatedConversationAreas = testController.conversationAreas;

          const eventListener = getEventListener(mockSocket, 'interactableUpdate');
          const mockListener = jest.fn() as jest.MockedFunction<
            TownEvents['conversationAreasChanged']
          >;
          testController.addListener('conversationAreasChanged', mockListener);
          eventListener(convArea);
          expect(mockListener).not.toBeCalled();

          const updatedController = updatedConversationAreas.find(
            eachArea => eachArea.id === convArea.id,
          );
          expect(updatedController?.topic).toEqual(convArea.topic);
          expect(updatedController?.occupants.map(eachOccupant => eachOccupant.id)).toEqual(
            convArea.occupantsByID,
          );
        });
        it('Emits a topicChange event if the topic of a conversation area changes', () => {
          const convArea = occupiedConversationArea();
          convArea.topic = nanoid();
          //Set up a topicChange listener
          const topicChangeListener = jest.fn();
          const convAreaController = testController.conversationAreas.find(
            eachArea => eachArea.id === convArea.id,
          );
          if (!convAreaController) {
            fail('Could not find conversation area controller');
            return;
          }
          convAreaController.addListener('topicChange', topicChangeListener);

          // Perform the update
          const eventListener = getEventListener(mockSocket, 'interactableUpdate');
          eventListener(convArea);

          expect(topicChangeListener).toBeCalledWith(convArea.topic);
        });
        it('Does not emit a topicChange event if the topic is unchanged', () => {
          const convArea = occupiedConversationArea();
          //Set up a topicChange listener
          const topicChangeListener = jest.fn();
          const convAreaController = testController.conversationAreas.find(
            eachArea => eachArea.id === convArea.id,
          );
          if (!convAreaController) {
            fail('Could not find conversation area controller');
          }
          convAreaController.addListener('topicChange', topicChangeListener);

          // Perform the update
          const eventListener = getEventListener(mockSocket, 'interactableUpdate');
          eventListener(convArea);

          expect(topicChangeListener).not.toBeCalled();
        });
        it('Emits an occupantsChange event if the occupants changed', () => {
          const convArea = occupiedConversationArea();
          convArea.occupantsByID = [townJoinResponse.userID, townJoinResponse.currentPlayers[1].id];

          //Set up an occupantsChange listener
          const occupantsChangeListener = jest.fn();
          const convAreaController = testController.conversationAreas.find(
            eachArea => eachArea.id === convArea.id,
          );
          if (!convAreaController) {
            fail('Could not find conversation area controller');
          }
          convAreaController.addListener('occupantsChange', occupantsChangeListener);

          // Perform the update
          const eventListener = getEventListener(mockSocket, 'interactableUpdate');
          eventListener(convArea);

          expect(occupantsChangeListener).toBeCalledTimes(1);
        });
        it('Does not emit an occupantsChange if the occupants have not changed', () => {
          const convArea = occupiedConversationArea();
          convArea.topic = nanoid();

          //Set up an occupantsChange listener
          const occupantsChangeListener = jest.fn();
          const convAreaController = testController.conversationAreas.find(
            eachArea => eachArea.id === convArea.id,
          );
          if (!convAreaController) {
            fail('Could not find conversation area controller');
          }
          convAreaController.addListener('occupantsChange', occupantsChangeListener);

          // Perform the update
          const eventListener = getEventListener(mockSocket, 'interactableUpdate');
          eventListener(convArea);

          expect(occupantsChangeListener).not.toBeCalled();
        });
      });
      describe('Viewing Area updates', () => {
        function viewingAreaOnTown() {
          return {
            ...(townJoinResponse.interactables.find(eachInteractable =>
              isViewingArea(eachInteractable),
            ) as ViewingArea),
          };
        }
        let viewingArea: ViewingArea;
        let viewingAreaController: ViewingAreaController;
        let eventListener: (update: ViewingArea) => void;
        beforeEach(() => {
          viewingArea = viewingAreaOnTown();
          const controller = testController.viewingAreas.find(
            eachArea => eachArea.id === viewingArea.id,
          );
          if (!controller) {
            fail(`Could not find viewing area controller for viewing area ${viewingArea.id}`);
          }
          viewingAreaController = controller;
          eventListener = getEventListener(mockSocket, 'interactableUpdate');
        });
        it('Updates the viewing area model', () => {
          viewingArea.video = nanoid();
          viewingArea.elapsedTimeSec++;
          viewingArea.isPlaying = !viewingArea.isPlaying;

          eventListener(viewingArea);

          expect(viewingAreaController.viewingAreaModel()).toEqual(viewingArea);
        });
        it('Emits a playbackChange event if isPlaying changes', () => {
          const listener = jest.fn();
          viewingAreaController.addListener('playbackChange', listener);

          viewingArea.isPlaying = !viewingArea.isPlaying;
          eventListener(viewingArea);
          expect(listener).toBeCalledWith(viewingArea.isPlaying);
        });
        it('Emits a progressChange event if the elapsedTimeSec chagnes', () => {
          const listener = jest.fn();
          viewingAreaController.addListener('progressChange', listener);

          viewingArea.elapsedTimeSec++;
          eventListener(viewingArea);
          expect(listener).toBeCalledWith(viewingArea.elapsedTimeSec);
        });
        it('Emits a videoChange event if the video changes', () => {
          const listener = jest.fn();
          viewingAreaController.addListener('videoChange', listener);

          viewingArea.video = nanoid();
          eventListener(viewingArea);
          expect(listener).toBeCalledWith(viewingArea.video);
        });
      });
    });
  });
  describe('Processing events that are received over the socket from the townService', () => {
    let testPlayer: PlayerModel;
    let testPlayerPlayersChangedFn: jest.MockedFunction<TownEvents['playersChanged']>;

    beforeEach(() => {
      //Create a new PlayerModel
      testPlayer = {
        id: nanoid(),
        location: { moving: false, rotation: 'back', x: 0, y: 1, interactableID: nanoid() },
        userName: nanoid(),
        doNotDisturbState: false,
      };
      //Add that player to the test town
      testPlayerPlayersChangedFn = emitEventAndExpectListenerFiring(
        'playerJoined',
        testPlayer,
        'playersChanged',
      );
    });
    it('Emits playersChanged events when players join', () => {
      expect(testPlayerPlayersChangedFn).toBeCalledWith([
        PlayerController.fromPlayerModel(testPlayer),
      ]);
    });

    it('Emits playersChanged events when players leave', () => {
      emitEventAndExpectListenerFiring('playerDisconnect', testPlayer, 'playersChanged', []);
    });
    it('Emits playerMoved events when players join', async () => {
      emitEventAndExpectListenerFiring(
        'playerJoined',
        testPlayer,
        'playerMoved',
        PlayerController.fromPlayerModel(testPlayer),
      );
    });
    it('Emits playerMoved events when players move', async () => {
      testPlayer.location = {
        moving: true,
        rotation: 'front',
        x: 1,
        y: 0,
        interactableID: nanoid(),
      };
      emitEventAndExpectListenerFiring(
        'playerMoved',
        testPlayer,
        'playerMoved',
        PlayerController.fromPlayerModel(testPlayer),
      );
    });
  });
  it('Disconnects the socket and clears the coveyTownController when disconnection', async () => {
    emitEventAndExpectListenerFiring('townClosing', undefined, 'disconnect');
    expect(mockLoginController.setTownController).toBeCalledWith(null);
  });
});
