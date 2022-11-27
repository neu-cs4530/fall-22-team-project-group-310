import { ChakraProvider } from '@chakra-ui/react';
import '@testing-library/jest-dom';
import '@testing-library/jest-dom/extend-expect';
import { act, fireEvent, render, RenderResult, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { nanoid } from 'nanoid';
import React from 'react';
import PlayerController, { PlayerEvents } from '../../classes/PlayerController';
import TownController, * as TownControllerHooks from '../../classes/TownController';
import * as useTownController from '../../hooks/useTownController';
import { mockTownController } from '../../TestUtils';
import { PlayerLocation, TeleportRequest } from '../../types/CoveyTownSocket';
import { PreviousTeleportRequestStatus } from '../../types/TypeUtils';
import * as PlayerName from './PlayerName';
import TeleportRequestNotificationsList from './TeleportRequestNotificationsList';

describe('TeleportRequestNotificationsList', () => {
  const randomLocation = (): PlayerLocation => ({
    moving: Math.random() < 0.5,
    rotation: 'front',
    x: Math.random() * 1000,
    y: Math.random() * 1000,
  });
  const wrappedTeleportRequestNotificationsListComponent = () => (
    <ChakraProvider>
      <React.StrictMode>
        <TeleportRequestNotificationsList />
      </React.StrictMode>
    </ChakraProvider>
  );
  const renderTeleportRequestNotificationsList = () =>
    render(wrappedTeleportRequestNotificationsListComponent());
  let consoleErrorSpy: jest.SpyInstance<void, [message?: any, ...optionalParms: any[]]>;
  let usePlayersSpy: jest.SpyInstance<PlayerController[], []>;
  let useTownControllerSpy: jest.SpyInstance<TownController, []>;
  let ourPlayerEmit: jest.SpyInstance<
    boolean,
    | [event: keyof PlayerEvents, newLocation: PlayerLocation]
    | [event: keyof PlayerEvents, newRequest: TeleportRequest | PreviousTeleportRequestStatus]
    | [event: keyof PlayerEvents, newIncomingList: TeleportRequest[]]
  >;
  let mockedTownController: TownController;
  let players: PlayerController[] = [];
  let incomingTeleports: TeleportRequest[] = [];
  let townID: string;
  let townFriendlyName: string;
  let ourPlayer: PlayerController;

  const expectProperlyRenderedTeleportRequestNotificationsList = async (
    renderData: RenderResult,
    teleportsToExpect: TeleportRequest[],
  ) => {
    const listEntries = await renderData.findAllByRole('listitem');
    expect(listEntries.length).toBe(teleportsToExpect.length);
    const teleportsMapped = teleportsToExpect.map(
      t => players.find(p => p.id === t.fromPlayerId)?.userName,
    );
    for (let i = 0; i < teleportsMapped.length; i += 1) {
      const teleportMapped = teleportsMapped[i];
      if (teleportMapped) {
        expect(listEntries[i]).toHaveTextContent(teleportMapped);
      }
      const parentComponent = listEntries[i].parentNode;
      if (parentComponent) {
        expect(parentComponent.nodeName).toBe('OL'); // list items expected to be directly nested in an ordered list
      }
    }
  };
  beforeAll(() => {
    // Spy on console.error and intercept react key warnings to fail test
    consoleErrorSpy = jest.spyOn(global.console, 'error');
    consoleErrorSpy.mockImplementation((message?, ...optionalParams) => {
      const stringMessage = message as string;
      if (stringMessage.includes && stringMessage.includes('children with the same key,')) {
        throw new Error(stringMessage.replace('%s', optionalParams[0]));
      } else if (stringMessage.includes && stringMessage.includes('warning-keys')) {
        throw new Error(stringMessage.replace('%s', optionalParams[0]));
      }
      // eslint-disable-next-line no-console -- we are wrapping the console with a spy to find react warnings
      console.warn(message, ...optionalParams);
    });
    usePlayersSpy = jest.spyOn(TownControllerHooks, 'usePlayers');
    useTownControllerSpy = jest.spyOn(useTownController, 'default');
  });

  beforeEach(() => {
    players = [];
    for (let i = 0; i < 10; i += 1) {
      players.push(
        new PlayerController(
          `testingPlayerID${i}-${nanoid()}`,
          `testingPlayerUser${i}-${nanoid()}}`,
          randomLocation(),
        ),
      );
    }
    ourPlayer = players[0];
    usePlayersSpy.mockReturnValue(players);
    const teleport0: TeleportRequest = {
      fromPlayerId: players[1].id,
      toPlayerId: players[0].id,
      time: new Date(),
    };
    const teleport1: TeleportRequest = {
      fromPlayerId: players[2].id,
      toPlayerId: players[0].id,
      time: new Date(),
    };
    const teleport2: TeleportRequest = {
      fromPlayerId: players[3].id,
      toPlayerId: players[0].id,
      time: new Date(),
    };
    incomingTeleports = [teleport0, teleport1, teleport2];
    ourPlayer.addIncomingTeleport(teleport0);
    ourPlayer.addIncomingTeleport(teleport1);
    ourPlayer.addIncomingTeleport(teleport2);
    ourPlayerEmit = jest.spyOn(ourPlayer, 'emit');
    townID = nanoid();
    townFriendlyName = nanoid();
    mockedTownController = mockTownController({
      friendlyName: townFriendlyName,
      townID,
      ourPlayer,
      players,
    });
    useTownControllerSpy.mockReturnValue(mockedTownController);
  });
  it('Renders no incoming teleports before any are added', async () => {
    const renderData = renderTeleportRequestNotificationsList();
    await expectProperlyRenderedTeleportRequestNotificationsList(renderData, incomingTeleports);
  });
  // it('Removes players from the list when they are removed from the town', async () => {
  //   const renderData = renderTeleportRequestNotificationsList();
  //   await expectProperlyRenderedTeleportRequestNotificationsList(renderData, players);
  //   for (let i = 0; i < players.length; i += 1) {
  //     const newPlayers = players.splice(i, 1);
  //     usePlayersSpy.mockReturnValue(newPlayers);
  //     renderData.rerender(wrappedTeleportRequestNotificationsListComponent());
  //     await expectProperlyRenderedTeleportRequestNotificationsList(renderData, newPlayers);
  //   }
  // });
  it('Emits teleport accept event when accept is clicked', async () => {
    const renderData = renderTeleportRequestNotificationsList();
    await expectProperlyRenderedTeleportRequestNotificationsList(renderData, incomingTeleports);

    const teleportAcceptButtons = await renderData.getAllByTestId('teleportAcceptButton');
    expect(teleportAcceptButtons.length).toBeGreaterThanOrEqual(0);

    act(() => {
      fireEvent.click(teleportAcceptButtons[0]);
    });

    expect(mockedTownController.emitTeleportAccepted).toHaveBeenCalled();
  });
  it('Emits teleport cancel event when cancel is clicked', async () => {
    const renderData = renderTeleportRequestNotificationsList();
    await expectProperlyRenderedTeleportRequestNotificationsList(renderData, incomingTeleports);

    const teleportDenyButtons = await renderData.getAllByTestId('teleportDenyButton');
    expect(teleportDenyButtons.length).toBeGreaterThanOrEqual(0);

    act(() => {
      fireEvent.click(teleportDenyButtons[0]);
    });

    expect(mockedTownController.emitTeleportDenied).toHaveBeenCalled();
  });
  it('emits incomingTeleportsChange when incoming teleport is removed', async () => {
    const renderData = renderTeleportRequestNotificationsList();
    await expectProperlyRenderedTeleportRequestNotificationsList(renderData, incomingTeleports);

    ourPlayer.removeIncomingTeleport(incomingTeleports[0]);
    expect(ourPlayerEmit).toBeCalledWith('incomingTeleportsChange', incomingTeleports.splice(1));
  });
  it('emits incomingTeleportsChange when incoming teleport is added', async () => {
    const renderData = renderTeleportRequestNotificationsList();
    await expectProperlyRenderedTeleportRequestNotificationsList(renderData, incomingTeleports);

    const teleport4: TeleportRequest = {
      fromPlayerId: players[4].id,
      toPlayerId: players[0].id,
      time: new Date(),
    };

    ourPlayer.addIncomingTeleport(teleport4);
    expect(ourPlayerEmit).toBeCalledWith(
      'incomingTeleportsChange',
      incomingTeleports.concat(teleport4),
    );
  });
});
