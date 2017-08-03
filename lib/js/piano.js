import * as Nexus from './NexusUI';

class Piano {
  constructor() {
    this.piano = new Nexus.Piano('#piano',{
    'size': [500,125],
    'mode': 'button',
    'lowNote': 24,
    'highNote': 60
    });
    this.keys = this.piano.keys;
    this.piano.on('change', function(v) {
      const int = Math.floor(Math.random() * (36 - 1 + 1)) + 1;
      sfx[int]();
    });
  }
}


export default Piano;
