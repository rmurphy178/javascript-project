import * as Nexus from './NexusUI';

class Sequencer {
  constructor(){
    this.sequencer = new Nexus.Sequencer('#sequencer',{
     'size': [1000,500],
     'mode': 'toggle',
     'rows': 8,
     'columns': 16
   });

  }
}




export default Sequencer;
