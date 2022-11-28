import { ChakraProvider } from '@chakra-ui/react';
import '@testing-library/jest-dom';
import '@testing-library/jest-dom/extend-expect';
import { fireEvent, render, RenderResult, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { nanoid } from 'nanoid';
import React from 'react';
import { act } from 'react-dom/test-utils';
import PlayerController from '../../classes/PlayerController';
import TownController, * as TownControllerHooks from '../../classes/TownController';
import * as useTownController from '../../hooks/useTownController';
import { mockTownController } from '../../TestUtils';
import { PlayerLocation, TeleportRequest } from '../../types/CoveyTownSocket';
import * as PlayerName from './PlayerName';
import PlayersList from './PlayersList';

describe('PlayersInTownList', () => {
  const randomLocation = (): PlayerLocation => ({
    moving: Math.random() < 0.5,
    rotation: 'front',
    x: Math.random() * 1000,
    y: Math.random() * 1000,
  });
  const wrappedPlayersListComponent = () => (
    <ChakraProvider>
      <React.StrictMode>
        <PlayersList />
      </React.StrictMode>
    </ChakraProvider>
  );
  const renderPlayersList = () => render(wrappedPlayersListComponent());
  let consoleErrorSpy: jest.SpyInstance<void, [message?: any, ...optionalParms: any[]]>;
  let usePlayersSpy: jest.SpyInstance<PlayerController[], []>;
  let useTownControllerSpy: jest.SpyInstance<TownController, []>;
  let mockedTownController: TownController;
  let players: PlayerController[] = [];
  let townID: string;
  let townFriendlyName: string;
  let ourPlayer: PlayerController;
  const expectProperlyRenderedPlayersList = async (
    renderData: RenderResult,
    playersToExpect: PlayerController[],
  ) => {
    const listEntries = await renderData.findAllByRole('listitem');
    expect(listEntries.length).toBe(playersToExpect.length); // expect same number of players

    // The first entry should always be ourPlayer
    expect(listEntries[0]).toHaveTextContent(ourPlayer.userName);
    let parentComponent = listEntries[0].parentNode;
    if (parentComponent) {
      expect(parentComponent.nodeName).toBe('OL'); // list items expected to be directly nested in an ordered list
    }

    listEntries.shift();
    const playersSortedCorrectly = playersToExpect
      .filter(p => p.id !== ourPlayer.id)
      .map(p => p.userName)
      .sort((p1, p2) => p1.localeCompare(p2, undefined, { numeric: true, sensitivity: 'base' }));

    expect(listEntries.length).toBe(playersSortedCorrectly.length);
    // The rest of the list items should be sorted correctly
    for (let i = 0; i < playersSortedCorrectly.length; i += 1) {
      expect(listEntries[i]).toHaveTextContent(playersSortedCorrectly[i]);
      parentComponent = listEntries[i].parentNode;
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
    townID = nanoid();
    townFriendlyName = nanoid();
    mockedTownController = mockTownController({
      friendlyName: townFriendlyName,
      townID,
      ourPlayer,
    });
    useTownControllerSpy.mockReturnValue(mockedTownController);
  });
  describe('Heading', () => {
    it('Displays a heading "Current town: townName', async () => {
      const renderData = renderPlayersList();
      const heading = await renderData.findByRole('heading', { level: 2 });
      expect(heading).toHaveTextContent(`Current town: ${townFriendlyName}`);
    });
    it('Includes a tooltip that has the town ID', async () => {
      const renderData = renderPlayersList();
      const heading = await renderData.findByRole('heading', { level: 2 });
      expect(renderData.queryByRole('tooltip')).toBeNull(); // no tooltip visible yet
      userEvent.hover(heading);
      const toolTip = await renderData.findByRole('tooltip'); // should be just one...
      expect(toolTip).toHaveTextContent(`Town ID: ${townID}`);
    });
  });
  it("Renders a list of all players' user names, without checking sort", async () => {
    // players array is already sorted correctly
    const renderData = renderPlayersList();
    await expectProperlyRenderedPlayersList(renderData, players);
  });
  it("Renders the players' names in a PlayerName component", async () => {
    const mockPlayerName = jest.spyOn(PlayerName, 'default');
    try {
      renderPlayersList();
      await waitFor(() => {
        expect(mockPlayerName).toBeCalledTimes(players.length);
      });
    } finally {
      mockPlayerName.mockRestore();
    }
  });
  it("Displays players' usernames in ascending alphabetical order", async () => {
    players.reverse();
    const renderData = renderPlayersList();
    await expectProperlyRenderedPlayersList(renderData, players);
  });
  it('Does not mutate the array returned by usePlayersInTown', async () => {
    players.reverse();
    const copyOfArrayPassedToComponent = players.concat([]);
    const renderData = renderPlayersList();
    await expectProperlyRenderedPlayersList(renderData, players);
    expect(players).toEqual(copyOfArrayPassedToComponent); // expect that the players array is unchanged by the compoennt
  });
  it('Adds players to the list when they are added to the town', async () => {
    const renderData = renderPlayersList();
    await expectProperlyRenderedPlayersList(renderData, players);
    for (let i = 0; i < players.length; i += 1) {
      const newPlayers = players.concat([
        new PlayerController(
          `testingPlayerID-${i}.new`,
          `testingPlayerUser${i}.new`,
          randomLocation(),
        ),
      ]);
      usePlayersSpy.mockReturnValue(newPlayers);
      renderData.rerender(wrappedPlayersListComponent());
      await expectProperlyRenderedPlayersList(renderData, newPlayers);
    }
  });
  it('Removes players from the list when they are removed from the town', async () => {
    const renderData = renderPlayersList();
    await expectProperlyRenderedPlayersList(renderData, players);
    for (let i = 0; i < players.length; i += 1) {
      let newPlayers = players.splice(i, 1);
      if (newPlayers[0].id !== ourPlayer.id) {
        newPlayers = newPlayers.concat([ourPlayer]);
      }
      usePlayersSpy.mockReturnValue(newPlayers);
      renderData.rerender(wrappedPlayersListComponent());
      await expectProperlyRenderedPlayersList(renderData, newPlayers);
    }
  });
  describe('Do not disturb button', () => {
    it('displays one do not disturb switch for our player in the town on first load', async () => {
      const renderData = renderPlayersList();
      await expectProperlyRenderedPlayersList(renderData, players);
      const doNotDisturbButton = await renderData.getAllByTestId('doNotDisturbButton');
      expect(doNotDisturbButton.length).toEqual(1);
    });
    it('emits an event to change do not disturb state when switch is toggled', async () => {
      const renderData = renderPlayersList();
      await expectProperlyRenderedPlayersList(renderData, players);
      const doNotDisturbButton = await renderData.getAllByTestId('doNotDisturbButton');
      expect(doNotDisturbButton.length).toEqual(1);
      const doNotDisturbButtonRole = await renderData.getByRole('checkbox');

      expect(ourPlayer.doNotDisturb).toEqual(false);
      act(() => {
        fireEvent.click(doNotDisturbButtonRole);
      });
      expect(mockedTownController.emitDoNotDisturbChange).toHaveBeenCalled();
      expect(mockedTownController.emitDoNotDisturbChange).toHaveBeenCalledTimes(1);
    });
    it('does not emit any teleport cancel or denied events when do not disturb switch is toggled and there are no incoming/outgoing teleports', async () => {
      const renderData = renderPlayersList();
      await expectProperlyRenderedPlayersList(renderData, players);
      const doNotDisturbButton = await renderData.getAllByTestId('doNotDisturbButton');
      expect(doNotDisturbButton.length).toEqual(1);
      const doNotDisturbButtonRole = await renderData.getByRole('checkbox');

      expect(ourPlayer.doNotDisturb).toEqual(false);
      act(() => {
        fireEvent.click(doNotDisturbButtonRole);
      });
      expect(mockedTownController.emitDoNotDisturbChange).toHaveBeenCalled();
      expect(mockedTownController.emitDoNotDisturbChange).toHaveBeenCalledTimes(1);
      expect(mockedTownController.emitTeleportCanceled).not.toHaveBeenCalled();
      expect(mockedTownController.emitTeleportDenied).not.toHaveBeenCalled();
    });
    it('emits an event to deny incoming teleports when do not disturb switch is toggled and there are incoming teleports', async () => {
      const renderData = renderPlayersList();
      await expectProperlyRenderedPlayersList(renderData, players);
      const doNotDisturbButtonRole = await renderData.getByRole('checkbox');

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
      ourPlayer.addIncomingTeleport(teleport0);
      ourPlayer.addIncomingTeleport(teleport1);

      expect(ourPlayer.doNotDisturb).toEqual(false);
      act(() => {
        fireEvent.click(doNotDisturbButtonRole);
      });
      expect(mockedTownController.emitDoNotDisturbChange).toHaveBeenCalled();
      expect(mockedTownController.emitDoNotDisturbChange).toHaveBeenCalledTimes(1);
      expect(mockedTownController.emitTeleportCanceled).not.toHaveBeenCalled();
      expect(mockedTownController.emitTeleportDenied).toHaveBeenCalled();
      expect(mockedTownController.emitTeleportDenied).toHaveBeenCalledTimes(2);
    });
    it('emits an event to cancel the outgoing teleports when do not disturb switch is toggled', async () => {
      const renderData = renderPlayersList();
      await expectProperlyRenderedPlayersList(renderData, players);
      const doNotDisturbButtonRole = await renderData.getByRole('checkbox');

      const teleport0: TeleportRequest = {
        fromPlayerId: players[0].id,
        toPlayerId: players[1].id,
        time: new Date(),
      };

      ourPlayer.outgoingTeleport = teleport0;

      act(() => {
        fireEvent.click(doNotDisturbButtonRole);
      });

      expect(mockedTownController.emitDoNotDisturbChange).toHaveBeenCalled();
      expect(mockedTownController.emitDoNotDisturbChange).toHaveBeenCalledTimes(1);
      expect(mockedTownController.emitTeleportDenied).not.toHaveBeenCalled();
      expect(mockedTownController.emitTeleportCanceled).toHaveBeenCalled();
      expect(mockedTownController.emitTeleportCanceled).toHaveBeenCalledTimes(1);
    });
  });
  describe('Timer', () => {
    it('starts the timer when ourPlayer makes a teleport request', async () => {
      const renderData = renderPlayersList();
      await expectProperlyRenderedPlayersList(renderData, players);

      const teleportRequestButtons = await renderData.getAllByTestId('teleportRequestButton');
      expect(teleportRequestButtons.length).toBeGreaterThanOrEqual(0);

      act(() => {
        fireEvent.click(teleportRequestButtons[0]);
      });

      expect(mockedTownController.emitTeleportRequest).toHaveBeenCalled();
      expect(mockedTownController.startOutgoingTeleportTimer).toHaveBeenCalled();
    });
    it('displays the timer when ourPlayer makes a teleport request', async () => {
      mockedTownController.ourPlayer.outgoingTeleport = {
        fromPlayerId: players[0].id,
        toPlayerId: players[1].id,
        time: new Date(),
      };

      mockedTownController.ourPlayer.outgoingTeleportTimer = 30;

      const renderData = renderPlayersList();

      const teleportCancelButtons = await renderData.getAllByTestId('teleportCancelButton');
      expect(teleportCancelButtons.length).toBe(1);

      const teleportTimer = await renderData.getAllByTestId('timerDisplay');
      expect(teleportTimer.length).toBe(1);
    });
  });
});
