You want to design the units first because they're the central part of the gameplay loop but actually let's talk from the beginning.

We want a rogue-like Civ TFT. I don't know if there's a one-sentence-fits-all description but the gameplay loop is divided into two large parts and one interface that connects both of them. The first part is maintaining your civilization, where you choose your species' traits and direction of technology, and then buy the specific units that appear in the shop.

What's important is that the tech in this game is not necessarily about buying weapons and operating them. It's more like buying things that help your civilization produce more talent. Talent is like a representation of rarity in this game. For example if you are initially given a bunch of mages that use fire, you want to build buildings or facilities that aid in that. If you get a bunch of knights or a bunch of horse riders, you're incentivized to build buildings that help them. Those buildings themselves also increase the quality of those types of units you get in a random pool.

We're thinking about 5 rounds and, in the grand scheme, the entire game's civilization development. Each round is composed of 3 eras of your civ management. In each subround you get to do the things I said: select your tech direction, upgrade your traits, and buy units from the shop. Those changes get applied almost like a reroll in each subround.

At the end of all rounds you get to combat with someone at your tier. Whether you win or lose, you take some abstracted amount of damage and in the next phase your civilization goes to the next tier. The tier and the talent pool are determined by the size of the civilization. You start at 100, go to 1,000, go to 100,000, and go to mill. We're thinking about that scale and each tier: common, uncommon, rare, epic, and legendary only appear at those thresholds but are probabilistic beyond that. If you build a specific building that aids that specific path you're going, it increases the odds or increases the quality of the specific units. 

Easier.

The actual combat: you buy the units that appear in your shop every subround to form a draft, the six-man team. Different units and different unit combinations will have different synergies. Units don't pass away but just by virtue of how this game progresses into larger tiers, you have to upgrade your units. Otherwise there'll be a generation gap.

After you select your six units you go to combat at the end of every round. The combat itself is just completely automatic. It's like an auto battler where you have different stats like range, defense, and offense and then specific abilities and specific energies. 

The order that we want to scope the build is: at least we're working without any specific framework but we're probably going to use a basic Vite React starter pack with some WebGL and canvas and probably React Three Fiber. Everything's going to be in 2D. It's just that we should make our own abstractions. If you want to we're thinking about also building our small pixel editor but to get things started the simplest gameplay loop is, again, the three things I said:
We want a screen to handle the management of civilization and some global game state that determines the round and subrounds.
The units themselves we can buy and assign to a troop so there should be a troop selection screen.
The field itself, where you combat with other civilizations.
Without getting complicated let's just start with a unit class that we can interact with in both the battlefield and the shop.


