// Sarah's first chat conversation
=== start ===
Hey! How's it going?
+ [Pretty good, you?]
    -> good_response
+ [Could be better...]
    -> bad_response

=== good_response ===
That's great to hear! I was thinking we could hang out later.
+ [Sounds fun!]
    -> END
+ [Maybe another time]
    -> END

=== bad_response ===
Oh no, what's wrong? Want to talk about it?
+ [It's nothing really]
    -> END
+ [Yeah, actually...]
    -> END
