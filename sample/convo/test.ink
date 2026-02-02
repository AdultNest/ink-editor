// <# start: { "pos-x": -350.0, "pos-y": 100.0 } #>
// <{ "pos-x": 50.0, "pos-y": 100.0 }>
// <# end: { "pos-x": 6100.0, "pos-y": 100.0 } #>


-> start

=== start ===
// <{ "pos-x": 50.0, "pos-y": 700.0 }>
Hey there! Welcome back. What can I get for you today?
# TYPING: 2s
+ [Order my usual] -> usual_order
+ [Try something new] -> new_order
+ [Just a chat] -> chat

=== usual_order ===
// <{ "pos-x": 4050.0, "pos-y": 100.0 }>
You always go for the vanilla latte, right?
# TYPING: 2s
-> serve_usual

=== new_order ===
// <{ "pos-x": 2450.0, "pos-y": 700.0 }>
Alright, what's new? Or should I say, what's brewing?
# TYPING: 2s
+ [Cappuccino] -> cappuccino
+ [Iced coffee] -> iced_coffee
+ [Tea] -> tea

=== cappuccino ===
// <{ "pos-x": 4050.0, "pos-y": 400.0 }>
Got it. Cappuccino it is.
# TYPING: 2s
-> serve_cappuccino

=== iced_coffee ===
// <{ "pos-x": 4050.0, "pos-y": 700.0 }>
Sounds refreshing. Coming right up!
# TYPING: 2s
-> serve_iced_coffee

=== tea ===
// <{ "pos-x": 3250.0, "pos-y": 1067.5 }>
Tea? Love it. Black or green?
# TYPING: 2s
+ [Black tea] -> black_tea
+ [Green tea] -> green_tea

=== black_tea ===
// <{ "pos-x": 4050.0, "pos-y": 1000.0 }>
Alright, black tea. Coming up.
# TYPING: 2s
-> serve_tea

=== green_tea ===
// <{ "pos-x": 4050.0, "pos-y": 1300.0 }>
Green tea, nice choice. Almost done.
# TYPING: 2s
-> serve_tea

=== chat ===
// <{ "pos-x": 850.0, "pos-y": 2720.0 }>
More than just coffee? How about we chat over a cup?
# TYPING: 2s
+ [Tell me about your day] -> talk_day
+ [Ask about your day] -> ask_day
+ [Recommend a book] -> book_recommendation

=== talk_day ===
// <{ "pos-x": 2450.0, "pos-y": 1967.5 }>
Sure, I'd love to hear about your day. How was it?
# TYPING: 2s
+ [It was great, thanks!] -> great_day
+ [It was okay, nothing special] -> okay_day

=== great_day ===
// <{ "pos-x": 3250.0, "pos-y": 1667.5 }>
That's great to hear! Anything exciting happen?
# TYPING: 2s
+ [Yes, my project got approved] -> project_approved
+ [No, just regular stuff] -> regular_stuff

=== okay_day ===
// <{ "pos-x": 3250.0, "pos-y": 2267.5 }>
Oh, okay. Work was busy then?
# TYPING: 2s
+ [Yes, long meetings all day] -> long_meetings
+ [No, it was pretty calm] -> calm_day

=== project_approved ===
// <{ "pos-x": 4050.0, "pos-y": 1600.0 }>
Congrats! That must be exciting. Tell me more.
# TYPING: 2s
-> talk_project

=== regular_stuff ===
// <{ "pos-x": 4050.0, "pos-y": 1900.0 }>
Well, I hope it gets better. Anything interesting?
# TYPING: 2s
-> talk_regular

=== long_meetings ===
// <{ "pos-x": 4050.0, "pos-y": 2200.0 }>
Oh, long meetings. I know, they can be draining. How many did you have?
# TYPING: 2s
-> talk_meetings

=== calm_day ===
// <{ "pos-x": 4050.0, "pos-y": 2500.0 }>
That's nice. Did you get to do anything fun?
# TYPING: 2s
-> talk_fun

=== serve_usual ===
// <{ "pos-x": 4850.0, "pos-y": 100.0 }>
Here you go. Your usual vanilla latte.
# TYPING: 2s
-> end

=== serve_cappuccino ===
// <{ "pos-x": 4850.0, "pos-y": 400.0 }>
Here's your cappuccino. Enjoy!
# TYPING: 2s
-> end

=== serve_iced_coffee ===
// <{ "pos-x": 4850.0, "pos-y": 700.0 }>
Iced coffee, right? Hope it's not too sweet.
# TYPING: 2s
-> end

=== serve_tea ===
// <{ "pos-x": 4850.0, "pos-y": 1067.5 }>
Your tea is ready. Black or green, as you requested.
# TYPING: 2s
-> end

=== talk_project ===
// <{ "pos-x": 4850.0, "pos-y": 1600.0 }>
Your project got approved? That's amazing! What's it about?
# TYPING: 2s
-> end

=== talk_regular ===
// <{ "pos-x": 4850.0, "pos-y": 1900.0 }>
It was a regular day then. Hope it got better.
# TYPING: 2s
-> end

=== talk_meetings ===
// <{ "pos-x": 4850.0, "pos-y": 2200.0 }>
How many meetings? Mine are always too long.
# TYPING: 2s
-> end

=== talk_fun ===
// <{ "pos-x": 4850.0, "pos-y": 2500.0 }>
Did you do anything fun today? Maybe grab some lunch with a friend?
# TYPING: 2s
-> end

=== ask_day ===
// <{ "pos-x": 1650.0, "pos-y": 2570.0 }>
Sure, I'd be happy to tell you about my day. So, how was yours?
# TYPING: 2s
-> talk_day

=== book_recommendation ===
// <{ "pos-x": 3250.0, "pos-y": 3617.5 }>
Books? Always a good conversation starter. What kind do you like?
# TYPING: 2s
+ [Mysteries] -> mysteries
+ [Science fiction] -> sci-fi
+ [Romance] -> romance

=== mysteries ===
// <{ "pos-x": 4050.0, "pos-y": 3250.0 }>
Mysteries? I love those. Who's your favorite author?
# TYPING: 2s
+ [Agatha Christie] ->  Christie
+ [Arthur Conan Doyle] -> doyle

=== sci-fi ===
Science fiction? Great genre. Do you prefer space adventures or cyberpunk?
# TYPING: 2s
+ [Space adventures] -> space
+ [Cyberpunk] -> cyber

=== romance ===
// <{ "pos-x": 4050.0, "pos-y": 4067.5 }>
Romance, oh I adore that. Any favorites?
# TYPING: 2s
+ [Jane Austen] -> austen
+ [Modern authors] -> modern

===  Christie ===
// <{ "pos-x": 4850.0, "pos-y": 2800.0 }>
Agatha Christie? The queen of mysteries. Have you read 'Murder on the Orient Express'?
# TYPING: 2s
-> end

=== doyle ===
// <{ "pos-x": 4850.0, "pos-y": 3100.0 }>
Arthur Conan Doyle, the creator of Sherlock Holmes. That's a classic.
# TYPING: 2s
-> end

=== space ===
// <{ "pos-x": 4850.0, "pos-y": 3400.0 }>
Space adventures, I love those. 'Dune' is a great start.
# TYPING: 2s
-> end

=== cyber ===
// <{ "pos-x": 4850.0, "pos-y": 3700.0 }>
Cyberpunk, so futuristic and gritty. 'Neuromancer' is a must-read.
# TYPING: 2s
-> end

=== austen ===
// <{ "pos-x": 4850.0, "pos-y": 4000.0 }>
Jane Austen, such timeless characters. 'Pride and Prejudice' is a favorite.
# TYPING: 2s
-> end

=== modern ===
// <{ "pos-x": 4850.0, "pos-y": 4300.0 }>
Modern romance? Plenty of great authors out there. What's your favorite?
# TYPING: 2s
-> end

=== end ===
// <{ "pos-x": 5650.0, "pos-y": 2267.5 }>
Well, that's it for now. Come back anytime!
# TYPING: 2s
-> END
