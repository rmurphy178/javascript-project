import * as Nexus from './NexusUI';


class Piano {
  constructor() {
    this.piano = new Nexus.Piano('#piano',{
    'size': [500,125],
    'mode': 'button', 
    'lowNote': 24,
    'highNote': 60
    });
  }
}


export default Piano;
