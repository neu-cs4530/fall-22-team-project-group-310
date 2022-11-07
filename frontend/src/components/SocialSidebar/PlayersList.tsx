import { Box, Button, Heading, ListItem, OrderedList, Tooltip } from '@chakra-ui/react';
import React, { useEffect, useState } from 'react';
import { usePlayers } from '../../classes/TownController';
import useTownController from '../../hooks/useTownController';
import { TeleportRequest } from '../../types/CoveyTownSocket';
import PlayerName from './PlayerName';

/**
 * Lists the current players in the town, along with the current town's name and ID
 *
 * See relevant hooks: `usePlayersInTown` and `useCoveyAppState`
 *
 */
export default function PlayersInTownList(): JSX.Element {
  const players = usePlayers();
  const townController = useTownController();
  const { friendlyName, townID, ourPlayer } = townController;
  const sorted = players.concat([]);
  sorted.sort((p1, p2) =>
    p1.userName.localeCompare(p2.userName, undefined, { numeric: true, sensitivity: 'base' }),
  );

  const [outgoingTeleport, setOutgoingTeleport] = useState<TeleportRequest | undefined>(
    ourPlayer.outgoingTeleport,
  );

  useEffect(() => {
    ourPlayer.addListener('outgoingTeleportChanged', setOutgoingTeleport);
    return () => {
      ourPlayer.removeListener('outgoingTeleportChanged', setOutgoingTeleport);
    };
  }, [ourPlayer]);

  // const renderButtons = (player: PlayerController) => {
  //   if(outgoingTeleport)
  // }

  // disabled={outgoingTeleport !== undefined}
  // townController.emitTeleportRequest(player.id)

  return (
    <Box>
      <Tooltip label={`Town ID: ${townID}`}>
        <Heading as='h2' fontSize='l'>
          Current town: {friendlyName}
        </Heading>
      </Tooltip>
      <OrderedList>
        {sorted.map(player => (
          <ListItem key={player.id}>
            <PlayerName player={player} />
            {player.id !== ourPlayer.id && (
              <Button onClick={() => console.log('test 12')}>Teleport</Button>
            )}
          </ListItem>
        ))}
      </OrderedList>
    </Box>
  );
}
