import {
  Box,
  Button,
  Heading,
  ListItem,
  OrderedList,
  Tooltip,
  useToast,
  IconButton,
} from '@chakra-ui/react';
import Cancel from '@material-ui/icons/Cancel';
import MyLocation from '@material-ui/icons/MyLocation';
import Block from '@material-ui/icons/Block';
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
  const [doNotDisturb, setDoNotDisturb] = useState<boolean>(ourPlayer.doNotDisturb);
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
    ourPlayer.addListener('doNotDisturbChange', setDoNotDisturb);

    return () => {
      ourPlayer.removeListener('outgoingTeleportChange', updateOutgoingTeleport);
      ourPlayer.removeListener('doNotDisturbChange', setDoNotDisturb);
    };
  }, [ourPlayer, outgoingTeleport, toast, players]);

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
            disabled={typeof outgoingTeleport !== 'string' || doNotDisturb || player.doNotDisturb}>
            Teleport
          </Button>
        );
      }
    } else {
      return (
        <IconButton
          variant={ourPlayer.doNotDisturb ? 'solid' : 'noOutline'}
          colorScheme='blue'
          aria-label='Call Sage'
          size='sm'
          icon={<Block />}
          onClick={() => {
            townController.emitDoNotDisturbChange();
            townController.emitTeleportCanceled(player.id);
            player.incomingTeleports.map(request => {
              townController.emitTeleportDenied(request);
            });
          }}
          data-testid='doNotDisturbButton'
        />
      );
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
