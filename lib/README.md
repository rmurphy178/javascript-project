# Sport Beats

### Background

Sport beats is an interactive sound board app that allows users to create and save audio tracks using popular songs overlaid with sport-themed sound effects. The app will be created using vanilla JavaScript, HTML/CSS, and jQuery. Users will be able to select from several popular songs to use as the base audio that sound effects will be added to. Users add sound effects by clicking on squares on the board to activate or deactivate them. Activated squares will produce a sound effect that is added to the base track when that square is cycled over. Each sound effect will also have an associated color that flashes when a square corresponding to that sound is cycled over. The app will also give users the ability to speed up or slow down their recorded tracks.


### Functionality & MVP

With Sport Beats, users will be able to:

- [ ] Choose from several songs to use for their track
- [ ] Activate squares on the board that will add a sound effect to their selected song and flash a corresponding color when that sound effect plays
- [ ] Save created tracks to local storage
- [ ] Speed up or slow down the playback rate of recorded tracks
- [ ] Turn sound on and off through a mute button

This project will also include:

- [ ] A production README


### Wireframes

This app will consist of a single screen with a board/sequencer and playback controls. Playback controls will include buttons for play, pause, record, mute, speed, and song selections.
![wireframes](images/sportbeats.png)


This project will be implemented with the following technologies:

- Vanilla JavaScript and `jquery` for overall structure and logic
- HTML/CSS for rendering and graphics
- Tone.js for sound effects
- NexusUI 2.0 for generating interface plus tuning & timing helper methods
- Webpack to bundle and serve up the relevant scripts


### Implementation Timeline

**Day 1**: Create the project skeleton and gather necessary sound effects:

- Setup required node modules and webpack
- Render basic soundboard
- Become familiar with tone.js and NexusUI

**Day 2**: Implement required classes and logic for sequencer/board & tiles:

- Toggle on and off to activate tile
- Play sound effect and light up when activated
- Implement logic for looping over board/tiles  

**Day 3**: Configure to allow track recordings to be saved locally:

- Record tracks and play them back at different speeds

**Day 4**: Style and refactor components. Goals for the day:

- Finish styling to maximize aesthetic appeal
- Refactor to enhance user experience and ensure intuitive functionality
