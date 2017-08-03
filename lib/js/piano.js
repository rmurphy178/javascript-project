import * as Nexus from './NexusUI';
import sfx from './sounds';
import { library } from './sounds';

class Piano {
  constructor() {
    this.piano = new Nexus.Piano('#piano',{
    'size': [500,125],
    'mode': 'button',
    'lowNote': 24,
    'highNote': 60
    });
    this.keys = this.piano.keys;
  }
}


export default Piano;
