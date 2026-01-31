// <# end: { "pos-x": 3395.7, "pos-y": -500.2 } #>
// Sample ink file with region grouping
-> start

// <# StartRegion: Introduction #>

=== start ===
// <{ "pos-x": 150, "pos-y": 100 }>
Hello! How are you today?
* [I'm doing great!] -> good_response
* [Not so well...] -> bad_response

=== good_response ===
// <{ "pos-x": 150, "pos-y": 400 }>
That's wonderful to hear!
-> continue_chat

=== bad_response ===
// <{ "pos-x": 550, "pos-y": 400 }>
I'm sorry to hear that. Is there anything I can do to help?
-> continue_chat

// <# EndRegion #>

// <# StartRegion: Main Conversation #>

=== continue_chat ===
// <{ "pos-x": 1000, "pos-y": 100 }>
Let's continue our chat.
* [Tell me a joke] -> joke
* [Let's talk about something else] -> topic_choice
* [I need to go] -> farewell

=== joke ===
// <{ "pos-x": 1000, "pos-y": 400 }>
Why did the scarecrow win an award? Because he was outstanding in his field!
* [Ha! Good one!] -> continue_chat
* [That's terrible...] -> continue_chat

=== topic_choice ===
// <{ "pos-x": 1400, "pos-y": 400 }>
What would you like to talk about?
* [The weather] -> weather_talk
* [Movies] -> movie_talk
* [Back to main menu] -> continue_chat

// <# EndRegion #>

// <# StartRegion: Topics #>

=== weather_talk ===
// <{ "pos-x": 1850, "pos-y": 100 }>
It's a beautiful day outside!
-> continue_chat

=== movie_talk ===
// <{ "pos-x": 2250, "pos-y": 100 }>
I love movies! What genre do you prefer?
* [Action] -> action_movies
* [Comedy] -> comedy_movies
* [Horror] -> horror_movies

=== action_movies ===
// <{ "pos-x": 1850, "pos-y": 400 }>
Action movies are exciting! Have you seen the latest blockbuster?
-> continue_chat

=== comedy_movies ===
// <{ "pos-x": 2250, "pos-y": 400 }>
Comedy movies always brighten my day!
-> continue_chat

=== horror_movies ===
// <{ "pos-x": 2650, "pos-y": 400 }>
Scary movies... I might need to hide behind a pillow!
-> continue_chat

=== farewell ===
// <{ "pos-x": 3100, "pos-y": 250 }>
Goodbye! It was nice chatting with you.
-> END
// <# EndRegion #>

=== test ===
// <{ "pos-x": 1370.9, "pos-y": -406.2 }>

// <# StartRegion: test #>
// <{ "pos-x": 400.0, "pos-y": 200.0 }>

// <# EndRegion #>
