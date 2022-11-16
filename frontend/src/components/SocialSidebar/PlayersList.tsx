import { Box, Button, Heading, ListItem, OrderedList, Tooltip, useToast } from '@chakra-ui/react';
import Cancel from '@material-ui/icons/Cancel';
import MyLocation from '@material-ui/icons/MyLocation';
import React, { useEffect, useState } from 'react';
import PlayerController from '../../classes/PlayerController';
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
  const toast = useToast();

  useEffect(() => {
    const updateOutgoingTeleport = (newOutgoingTeleport: TeleportRequest | undefined) => {
      if (!newOutgoingTeleport && outgoingTeleport) {
        toast({
          title: 'ahhh',
          status: 'info',
        });
      }

      setOutgoingTeleport(newOutgoingTeleport);
    };

    ourPlayer.addListener('outgoingTeleportChange', updateOutgoingTeleport);
    return () => {
      ourPlayer.removeListener('outgoingTeleportChange', updateOutgoingTeleport);
    };
  }, [ourPlayer, outgoingTeleport, toast]);

  const renderButtons = (player: PlayerController) => {
    if (player.id !== ourPlayer.id) {
      if (outgoingTeleport && outgoingTeleport.toPlayerId === player.id) {
        return (
          <Button
            onClick={() => {
              townController.emitTeleportCanceled(player.id);
            }}
            leftIcon={<Cancel fontSize='small' />}
            size='xs'
            colorScheme={'red'}
            margin='1.5'>
            Cancel
          </Button>
        );
      } else {
        return (
          <Button
            onClick={() => {
              townController.emitTeleportRequest(player.id);
            }}
            leftIcon={<MyLocation fontSize='small' />}
            size='xs'
            colorScheme={'blue'}
            margin='1.5'
            disabled={outgoingTeleport !== undefined}>
            Teleport
          </Button>
        );
      }
    }
  };

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
            {renderButtons(player)}
          </ListItem>
        ))}
      </OrderedList>
    </Box>
  );
}
