import EventEmitter from 'events';
import _ from 'lodash';
import TypedEmitter from 'typed-emitter';
import { Player as PlayerModel, PlayerLocation, TeleportRequest } from '../types/CoveyTownSocket';
import { PreviousTeleportRequestStatus } from '../types/TypeUtils';

export type PlayerEvents = {
  movement: (newLocation: PlayerLocation) => void;
  outgoingTeleportChange: (newRequest: TeleportRequest | PreviousTeleportRequestStatus) => void;
  incomingTeleportsChange: (newIncomingList: TeleportRequest[]) => void;
  doNotDisturbChange: (newValue: boolean) => void;
};

export type PlayerGameObjects = {
  sprite: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  label: Phaser.GameObjects.Text;
  locationManagedByGameScene: boolean /* For the local player, the game scene will calculate the current location, and we should NOT apply updates when we receive events */;
};
export default class PlayerController extends (EventEmitter as new () => TypedEmitter<PlayerEvents>) {
  private _location: PlayerLocation;

  private readonly _id: string;

  private readonly _userName: string;

  public gameObjects?: PlayerGameObjects;

  private _incomingTeleports: TeleportRequest[] = [];

  private _outgoingTeleport: TeleportRequest | PreviousTeleportRequestStatus =
    PreviousTeleportRequestStatus.Default;

  private _doNotDisturb = false;

  constructor(id: string, userName: string, location: PlayerLocation) {
    super();
    this._id = id;
    this._userName = userName;
    this._location = location;
  }

  set location(newLocation: PlayerLocation) {
    this._location = newLocation;
    this._updateGameComponentLocation();
    this.emit('movement', newLocation);
  }

  get location(): PlayerLocation {
    return this._location;
  }

  get userName(): string {
    return this._userName;
  }

  get id(): string {
    return this._id;
  }

  set outgoingTeleport(request: TeleportRequest | PreviousTeleportRequestStatus) {
    if (this._outgoingTeleport !== request) {
      this._outgoingTeleport = request;
      this.emit('outgoingTeleportChange', request);
    }
  }

  get outgoingTeleport(): TeleportRequest | PreviousTeleportRequestStatus {
    return this._outgoingTeleport;
  }

  get incomingTeleports(): TeleportRequest[] {
    return this._incomingTeleports;
  }

  set doNotDisturb(newValue: boolean) {
    // check if valid toggle before emitting
    if (newValue !== this._doNotDisturb) {
      this._doNotDisturb = newValue;
      this.emit('doNotDisturbChange', newValue);
    }
  }

  get doNotDisturb() {
    return this._doNotDisturb;
  }

  public addIncomingTeleport(request: TeleportRequest): void {
    if (!this._incomingTeleports.find(teleport => _.isEqual(teleport, request))) {
      this._incomingTeleports.push(request);
      this.emit('incomingTeleportsChange', [...this._incomingTeleports]);
    }
  }

  public removeIncomingTeleport(request: TeleportRequest): void {
    if (this._incomingTeleports.find(teleport => _.isEqual(teleport, request))) {
      this._incomingTeleports = this._incomingTeleports.filter(
        teleport => !_.isEqual(teleport, request),
      );
      this.emit('incomingTeleportsChange', [...this._incomingTeleports]);
    }
  }

  toPlayerModel(): PlayerModel {
    return { id: this.id, userName: this.userName, location: this.location };
  }

  private _updateGameComponentLocation() {
    if (this.gameObjects && !this.gameObjects.locationManagedByGameScene) {
      const { sprite, label } = this.gameObjects;
      if (!sprite.anims) return;
      sprite.setX(this.location.x);
      sprite.setY(this.location.y);
      label.setX(sprite.body.position.x);
      label.setY(sprite.body.position.y - 20);
      if (this.location.moving) {
        sprite.anims.play(`misa-${this.location.rotation}-walk`, true);
      } else {
        sprite.anims.stop();
        sprite.setTexture('atlas', `misa-${this.location.rotation}`);
      }
    }
  }

  static fromPlayerModel(modelPlayer: PlayerModel): PlayerController {
    return new PlayerController(modelPlayer.id, modelPlayer.userName, modelPlayer.location);
  }
}
