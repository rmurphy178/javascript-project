import NexusUI from './NexusUI';


let Nexus = new NexusUI();

if (window) {
  window.Nexus = Nexus;
}

export default Nexus;
