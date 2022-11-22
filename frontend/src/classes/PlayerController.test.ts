import { mock, mockClear } from 'jest-mock-extended';
import { nanoid } from 'nanoid';
import { PlayerLocation, TeleportRequest } from '../types/CoveyTownSocket';
import { PreviousTeleportRequestStatus } from '../types/TypeUtils';
import PlayerController, { PlayerEvents } from './PlayerController';

describe('PlayerController', () => {
  let testPlayer: PlayerController;
  let playerId: string;
  let playerName: string;
  let location: PlayerLocation;
  let testTeleportRequest: TeleportRequest;
  const mockListeners = mock<PlayerEvents>();
  beforeEach(() => {
    playerId = nanoid();
    playerName = nanoid();
    location = { x: 0, y: 0, rotation: 'front', moving: false };
    testPlayer = new PlayerController(playerId, playerName, location, false);
    testTeleportRequest = { fromPlayerId: nanoid(), toPlayerId: nanoid(), time: new Date() };
    expect(testPlayer.incomingTeleports).toStrictEqual([]);
    testPlayer.addIncomingTeleport(testTeleportRequest);
    expect(testPlayer.incomingTeleports).toStrictEqual([testTeleportRequest]);
    mockClear(mockListeners.movement);
    mockClear(mockListeners.outgoingTeleportChange);
    mockClear(mockListeners.incomingTeleportsChange);
    mockClear(mockListeners.doNotDisturbChange);
    testPlayer.addListener('movement', mockListeners.movement);
    testPlayer.addListener('outgoingTeleportChange', mockListeners.outgoingTeleportChange);
    testPlayer.addListener('incomingTeleportsChange', mockListeners.incomingTeleportsChange);
    testPlayer.addListener('doNotDisturbChange', mockListeners.doNotDisturbChange);
  });
  describe('Setting location property', () => {
    it('updates the property and emits a movemnt event', () => {
      expect(testPlayer.location).toEqual(location);
      expect(mockListeners.movement).not.toBeCalled();
      const newLocation: PlayerLocation = { x: 10, y: 0, rotation: 'right', moving: true };
      testPlayer.location = newLocation;
      expect(testPlayer.location).toEqual(newLocation);
      expect(mockListeners.movement).toHaveBeenCalledWith(newLocation);
    });
  });
  describe('Setting outgoingTeleport property', () => {
    it('updates the property and emits an outgoingTeleportChange event if the property changes', () => {
      expect(testPlayer.outgoingTeleport).toEqual(PreviousTeleportRequestStatus.Default);
      expect(mockListeners.outgoingTeleportChange).not.toBeCalled();
      const request: TeleportRequest = {
        fromPlayerId: nanoid(),
        toPlayerId: nanoid(),
        time: new Date(),
      };
      testPlayer.outgoingTeleport = request;
      expect(testPlayer.outgoingTeleport).toEqual(request);
      expect(mockListeners.outgoingTeleportChange).toHaveBeenCalledWith(request);
      testPlayer.outgoingTeleport = PreviousTeleportRequestStatus.Accepted;
      expect(testPlayer.outgoingTeleport).toEqual(PreviousTeleportRequestStatus.Accepted);
      expect(mockListeners.outgoingTeleportChange).toHaveBeenCalledWith(
        PreviousTeleportRequestStatus.Accepted,
      );
    });
    it('does not emit an outgoingTeleportChange event if the property does not change', () => {
      expect(testPlayer.outgoingTeleport).toEqual(PreviousTeleportRequestStatus.Default);
      expect(mockListeners.outgoingTeleportChange).not.toBeCalled();
      testPlayer.outgoingTeleport = PreviousTeleportRequestStatus.Default;
      expect(testPlayer.outgoingTeleport).toEqual(PreviousTeleportRequestStatus.Default);
      expect(mockListeners.outgoingTeleportChange).not.toBeCalled();
    });
  });
  describe('Setting the incomingTeleportsList property', () => {
    it('updates the property and emits an incomingTeleportsChange event if a request is added', () => {
      expect(testPlayer.incomingTeleports).toStrictEqual([testTeleportRequest]);
      expect(mockListeners.incomingTeleportsChange).not.toBeCalled();
      const request: TeleportRequest = {
        fromPlayerId: nanoid(),
        toPlayerId: nanoid(),
        time: new Date(),
      };
      testPlayer.addIncomingTeleport(request);
      expect(testPlayer.incomingTeleports).toStrictEqual([testTeleportRequest, request]);
      expect(mockListeners.incomingTeleportsChange).toHaveBeenCalledWith([
        testTeleportRequest,
        request,
      ]);
    });
    it('does not emit an incomingTeleportsChange if a duplicate request is added', () => {
      expect(testPlayer.incomingTeleports).toStrictEqual([testTeleportRequest]);
      expect(mockListeners.incomingTeleportsChange).not.toBeCalled();
      testPlayer.addIncomingTeleport(testTeleportRequest);
      expect(testPlayer.incomingTeleports).toStrictEqual([testTeleportRequest]);
      expect(mockListeners.incomingTeleportsChange).not.toBeCalled();
    });
    it('updates the property and emits an incomingTeleportsChange event if a request is removed', () => {
      expect(testPlayer.incomingTeleports).toStrictEqual([testTeleportRequest]);
      expect(mockListeners.incomingTeleportsChange).not.toBeCalled();
      testPlayer.removeIncomingTeleport(testTeleportRequest);
      expect(testPlayer.incomingTeleports).toStrictEqual([]);
      expect(mockListeners.incomingTeleportsChange).toHaveBeenCalledWith([]);
    });
    it('does not emit an incomingTeleportsChange event if a request not in the list is removed', () => {
      expect(testPlayer.incomingTeleports).toStrictEqual([testTeleportRequest]);
      expect(mockListeners.incomingTeleportsChange).not.toBeCalled();
      const request: TeleportRequest = {
        fromPlayerId: nanoid(),
        toPlayerId: nanoid(),
        time: new Date(),
      };
      testPlayer.removeIncomingTeleport(request);
      expect(testPlayer.incomingTeleports).toStrictEqual([testTeleportRequest]);
      expect(mockListeners.incomingTeleportsChange).not.toBeCalled();
    });
  });
  describe('setting doNotDisturb property', () => {
    it('updates the property and emits a doNotDisturbChanged event if the value changes', () => {
      expect(testPlayer.doNotDisturb).toEqual(false);
      expect(mockListeners.doNotDisturbChange).not.toBeCalled();
      testPlayer.doNotDisturb = true;
      expect(testPlayer.doNotDisturb).toEqual(true);
      expect(mockListeners.doNotDisturbChange).toHaveBeenCalledWith(true);
    });
    it('does not emit a doNotDisturbChanged event if the value does not change', () => {
      expect(testPlayer.doNotDisturb).toEqual(false);
      expect(mockListeners.doNotDisturbChange).not.toBeCalled();
      testPlayer.doNotDisturb = false;
      expect(testPlayer.doNotDisturb).toEqual(false);
      expect(mockListeners.doNotDisturbChange).not.toBeCalled();
    });
  });
});
