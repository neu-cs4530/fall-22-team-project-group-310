import { ChakraProvider } from '@chakra-ui/react';
import '@testing-library/jest-dom';
import '@testing-library/jest-dom/extend-expect';
import { act, fireEvent, render, RenderResult, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockReset } from 'jest-mock-extended';
import { nanoid } from 'nanoid';
import React from 'react';
import PlayerController from '../../classes/PlayerController';
import TownController, * as TownControllerHooks from '../../classes/TownController';
import * as useTownController from '../../hooks/useTownController';
import { mockTownController } from '../../TestUtils';
import { PlayerLocation } from '../../types/CoveyTownSocket';
import { PreviousTeleportRequestStatus } from '../../types/TypeUtils';
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
  // let emitTeleportRequestSpy: jest.SpyInstance<void, [string]>;
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
    const playersSortedCorrectly = playersToExpect
      .map(p => p.userName)
      .sort((p1, p2) => p1.localeCompare(p2, undefined, { numeric: true, sensitivity: 'base' }));
    for (let i = 0; i < playersSortedCorrectly.length; i += 1) {
      expect(listEntries[i]).toHaveTextContent(playersSortedCorrectly[i]);
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
      const newPlayers = players.splice(i, 1);
      usePlayersSpy.mockReturnValue(newPlayers);
      renderData.rerender(wrappedPlayersListComponent());
      await expectProperlyRenderedPlayersList(renderData, newPlayers);
    }
  });
  it('displays a teleport request button next to each player in the town on first load', async () => {
    const renderData = renderPlayersList();
    await expectProperlyRenderedPlayersList(renderData, players);

    const listEntries = await renderData.findAllByRole('listitem');
    const teleportRequestButtons = await renderData.getAllByTestId('teleportRequestButton');

    expect(teleportRequestButtons.length).toEqual(listEntries.length - 1); // subtract 1 for your own player
  });
  it('emits teleport request event when clicked', async () => {
    const renderData = renderPlayersList();
    await expectProperlyRenderedPlayersList(renderData, players);

    const teleportRequestButtons = await renderData.getAllByTestId('teleportRequestButton');
    expect(teleportRequestButtons.length).toBeGreaterThanOrEqual(0);

    act(() => {
      fireEvent.click(teleportRequestButtons[0]);
    });

    expect(mockedTownController.emitTeleportRequest).toHaveBeenCalled();
  });
  it('emits teleport cancel event when clicked and is cancel button', async () => {
    const renderData = renderPlayersList();
    await expectProperlyRenderedPlayersList(renderData, players);

    const teleportRequestButtons = await renderData.getAllByTestId('teleportRequestButton');
    expect(teleportRequestButtons.length).toBeGreaterThanOrEqual(0);

    mockedTownController.ourPlayer.outgoingTeleport = {
      fromPlayerId: players[0].id,
      toPlayerId: players[1].id,
      time: new Date(),
    };
    renderData.rerender(wrappedPlayersListComponent());

    act(() => {
      fireEvent.click(teleportRequestButtons[0]);
    });

    expect(mockedTownController.emitTeleportCanceled).toHaveBeenCalled();
  });
  it('displays a teleport cancel button and disables other teleport buttons when outgoing teleport is pending', async () => {
    const renderData = renderPlayersList();
    await expectProperlyRenderedPlayersList(renderData, players);

    const listEntries = await renderData.findAllByRole('listitem');
    let teleportRequestButtons = await renderData.getAllByTestId('teleportRequestButton');
    expect(teleportRequestButtons.length).toEqual(listEntries.length - 1);

    mockedTownController.ourPlayer.outgoingTeleport = {
      fromPlayerId: players[0].id,
      toPlayerId: players[1].id,
      time: new Date(),
    };
    renderData.rerender(wrappedPlayersListComponent());

    // check for cancel button
    const teleportCancelButtons = await renderData.getAllByTestId('teleportCancelButton');
    expect(teleportCancelButtons.length).toEqual(1);

    // check for disabled teleport request buttons
    teleportRequestButtons = await renderData.getAllByTestId('teleportRequestButton');
    for (let i = 0; i < teleportRequestButtons.length; i += 1) {
      expect(teleportRequestButtons[i]).toHaveAttribute('disabled');
    }
  });
  it('displays all teleport buttons when outgoing teleport changes to PreviousTeleportRequestStatus', async () => {
    const renderData = renderPlayersList();
    await expectProperlyRenderedPlayersList(renderData, players);

    let listEntries = await renderData.findAllByRole('listitem');
    let teleportRequestButtons = await renderData.getAllByTestId('teleportRequestButton');
    expect(teleportRequestButtons.length).toEqual(listEntries.length - 1);

    mockedTownController.ourPlayer.outgoingTeleport = {
      fromPlayerId: ourPlayer.id,
      toPlayerId: players[1].id,
      time: new Date(),
    };

    mockedTownController.ourPlayer.outgoingTeleport = PreviousTeleportRequestStatus.Default;
    renderData.rerender(wrappedPlayersListComponent());

    // check for right number of teleport buttons
    listEntries = await renderData.findAllByRole('listitem');
    teleportRequestButtons = await renderData.getAllByTestId('teleportRequestButton');
    expect(teleportRequestButtons.length).toEqual(listEntries.length - 1);

    // check for cancel button
    const teleportCancelButtons = await renderData.queryAllByTestId('teleportCancelButton');
    expect(teleportCancelButtons.length).toEqual(0);

    // check for disabled teleport request buttons
    teleportRequestButtons = await renderData.getAllByTestId('teleportRequestButton');
    for (let i = 0; i < teleportRequestButtons.length; i += 1) {
      expect(teleportRequestButtons[i]).not.toHaveAttribute('disabled');
    }
  });
});
