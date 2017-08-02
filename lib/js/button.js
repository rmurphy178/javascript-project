import * as Nexus from './NexusUI';


class Button {
  constructor(){
    this.button = new Nexus.TextButton('#button');
  }

  play(){
    const audio = new Audio('./lib/media/bad_company.mp3');
    audio.play();
  }
}

export default Button;
