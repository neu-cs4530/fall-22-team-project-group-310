import EventEmitter from 'events';
import _ from 'lodash';
import TypedEmitter from 'typed-emitter';
import { Player as PlayerModel, PlayerLocation, TeleportRequest } from '../types/CoveyTownSocket';

export type PlayerEvents = {
  movement: (newLocation: PlayerLocation) => void;
  outgoingTeleportChange: (newRequest: TeleportRequest | undefined) => void;
  incomingTeleportsChange: (newIncomingList: TeleportRequest[]) => void;
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

  private _outgoingTeleport: TeleportRequest | undefined = undefined;

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

  set outgoingTeleport(request: TeleportRequest | undefined) {
    if (this._outgoingTeleport !== request) {
      this._outgoingTeleport = request;
      this.emit('outgoingTeleportChange', request);
    }
  }

  get outgoingTeleport(): TeleportRequest | undefined {
    return this._outgoingTeleport;
  }

  get incomingTeleports(): TeleportRequest[] {
    return this._incomingTeleports;
  }

  public addIncomingTeleport(request: TeleportRequest): void {
    if (this._incomingTeleports.indexOf(request) === -1) {
      this._incomingTeleports.push(request);
      this.emit('incomingTeleportsChange', [...this._incomingTeleports]);
    }
  }

  public removeIncomingTeleport(request: TeleportRequest): void {
    const newIncomingList = this._incomingTeleports.filter(teleport => teleport !== request);
    if (!_.isEqual(this._incomingTeleports, newIncomingList)) {
      this._incomingTeleports = newIncomingList;
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
