import { Box, Button, Heading, ListItem, OrderedList, Tooltip, useToast } from '@chakra-ui/react';
import Cancel from '@material-ui/icons/Cancel';
import MyLocation from '@material-ui/icons/MyLocation';
import React, { useEffect, useState } from 'react';
import PlayerController from '../../classes/PlayerController';
import { usePlayers } from '../../classes/TownController';
import useTownController from '../../hooks/useTownController';
import { TeleportRequest } from '../../types/CoveyTownSocket';
import { PreviousTeleportRequestStatus } from '../../types/TypeUtils';
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
  const sortedPlayers = players.concat([]);
  sortedPlayers.sort((p1, p2) =>
    p1.userName.localeCompare(p2.userName, undefined, { numeric: true, sensitivity: 'base' }),
  );
  const [outgoingTeleport, setOutgoingTeleport] = useState<
    TeleportRequest | PreviousTeleportRequestStatus
  >(ourPlayer.outgoingTeleport);
  const toast = useToast();

  useEffect(() => {
    const updateOutgoingTeleport = (
      newOutgoingTeleport: TeleportRequest | PreviousTeleportRequestStatus,
    ) => {
      if (
        typeof newOutgoingTeleport === 'string' &&
        typeof outgoingTeleport !== 'string' &&
        newOutgoingTeleport !== PreviousTeleportRequestStatus.Cancelled
      ) {
        toast({
          title:
            players.find((player: PlayerController) => player.id === outgoingTeleport.toPlayerId)
              ?.userName +
            ' ' +
            newOutgoingTeleport +
            ' your teleport request',
          status: 'info',
        });
      }

      setOutgoingTeleport(newOutgoingTeleport);
    };

    ourPlayer.addListener('outgoingTeleportChange', updateOutgoingTeleport);
    return () => {
      ourPlayer.removeListener('outgoingTeleportChange', updateOutgoingTeleport);
    };
  }, [ourPlayer, outgoingTeleport, toast, players]);

  useEffect(() => {
    const successToast = (request: TeleportRequest) => {
      toast({
        title: `
       ${
         request.fromPlayerId === ourPlayer.id
           ? 'You'
           : players.find((player: PlayerController) => player.id === request.fromPlayerId)
               ?.userName
       } 
           successfully teleported to 
          ${
            request.toPlayerId === ourPlayer.id
              ? 'you'
              : players.find((player: PlayerController) => player.id === request.toPlayerId)
                  ?.userName
          }`,
        status: 'success',
      });
    };

    const failedToast = (request: TeleportRequest) => {
      toast({
        title: `
       ${
         request.fromPlayerId === ourPlayer.id
           ? 'You'
           : players.find((player: PlayerController) => player.id === request.fromPlayerId)
               ?.userName
       } 
           failed to teleport to 
          ${
            request.toPlayerId === ourPlayer.id
              ? 'you'
              : players.find((player: PlayerController) => player.id === request.toPlayerId)
                  ?.userName
          }`,
        status: 'error',
      });
    };

    townController.addListener('teleportSuccess', successToast);
    townController.addListener('teleportFailed', failedToast);
    return () => {
      townController.removeListener('teleportSuccess', successToast);
      townController.removeListener('teleportFailed', failedToast);
    };
  }, [townController, toast, players, ourPlayer.id]);

  const renderButtons = (player: PlayerController) => {
    if (player.id !== ourPlayer.id) {
      if (typeof outgoingTeleport !== 'string' && outgoingTeleport.toPlayerId === player.id) {
        return (
          <Button
            onClick={() => {
              townController.emitTeleportCanceled(player.id);
            }}
            leftIcon={<Cancel fontSize='small' />}
            size='xs'
            colorScheme={'red'}
            margin='1.5'
            data-testid='teleportCancelButton'>
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
            disabled={typeof outgoingTeleport !== 'string'}
            data-testid='teleportRequestButton'>
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
        {sortedPlayers.map(player => (
          <ListItem key={player.id}>
            <PlayerName player={player} />
            {renderButtons(player)}
          </ListItem>
        ))}
      </OrderedList>
    </Box>
  );
}
