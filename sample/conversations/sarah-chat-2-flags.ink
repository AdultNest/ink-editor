// Sarah's second chat - demonstrates story flags
// This conversation remembers choices from previous interactions

EXTERNAL GetStoryFlag(flagName)
EXTERNAL SetStoryFlag(flagName)
EXTERNAL RemoveStoryFlag(flagName)

-> start

=== start ===
{
    - GetStoryFlag("sarah_angry"):
        She's still mad at you from last time.
        -> angry_sarah
    - GetStoryFlag("sarah_happy"):
        She seems in a good mood today!
        -> happy_sarah
    - else:
        Sarah waves at you.
        -> neutral_sarah
}

=== angry_sarah ===
Sarah crosses her arms.
"I'm still upset about what happened."
+ [Apologize sincerely]
    ~ SetStoryFlag("player_apologized")
    ~ RemoveStoryFlag("sarah_angry")
    -> apology_accepted
+ [Make an excuse]
    -> excuse_rejected
+ [Walk away]
    -> walk_away

=== happy_sarah ===
Sarah smiles brightly.
"Hey! I was hoping I'd run into you!"
+ [Ask about her day]
    -> happy_chat
+ [Mention the party]
    {
        - GetStoryFlag("party_invitation_sent"):
            -> party_followup
        - else:
            ~ SetStoryFlag("party_invitation_sent")
            -> party_invite
    }

=== neutral_sarah ===
"Oh hey! Long time no see."
+ [Be friendly]
    ~ SetStoryFlag("sarah_happy")
    -> friendly_response
+ [Be dismissive]
    ~ SetStoryFlag("sarah_angry")
    -> dismissive_response
+ [Ask for a favor]
    {
        - GetStoryFlag("owes_sarah_favor"):
            -> favor_denied
        - else:
            -> favor_request
    }

=== apology_accepted ===
Her expression softens.
"Thank you... I appreciate you saying that."
~ SetStoryFlag("sarah_happy")
+ [Suggest getting coffee]
    -> coffee_invite
+ [Say goodbye]
    -> END

=== excuse_rejected ===
She rolls her eyes.
"Sure, whatever you say."
~ SetStoryFlag("sarah_angry")
-> END

=== walk_away ===
~ SetStoryFlag("walked_away_from_sarah")
You turn and leave without a word.
-> END

=== happy_chat ===
"It's been great! I got that promotion I was telling you about."
+ [Congratulate her]
    ~ SetStoryFlag("congratulated_sarah")
    -> congratulations
+ [Change the subject]
    -> subject_change

=== party_invite ===
"There's a party this weekend. You should come!"
+ [Accept the invitation]
    ~ SetStoryFlag("accepted_party_invite")
    -> party_accepted
+ [Decline politely]
    -> party_declined

=== party_followup ===
"So are you still coming to the party?"
{
    - GetStoryFlag("accepted_party_invite"):
        "Great! I'll see you there!"
        -> END
    - else:
        "Changed your mind yet?"
        + [Actually, yes!]
            ~ SetStoryFlag("accepted_party_invite")
            -> party_accepted
        + [Still can't make it]
            -> party_declined
}

=== party_accepted ===
"Awesome! It's going to be so much fun!"
-> END

=== party_declined ===
"That's too bad. Maybe next time!"
~ RemoveStoryFlag("party_invitation_sent")
-> END

=== friendly_response ===
She brightens up.
"It's so nice to see you! How have you been?"
+ [Great!]
    -> positive_catchup
+ [Not so great...]
    -> negative_catchup

=== dismissive_response ===
Her smile fades.
"Oh... okay then. I'll just... go."
-> END

=== favor_request ===
"What kind of favor?"
+ [Borrow some money]
    ~ SetStoryFlag("owes_sarah_favor")
    -> money_borrowed
+ [Help with moving]
    ~ SetStoryFlag("owes_sarah_favor")
    -> moving_help
+ [Never mind]
    -> END

=== favor_denied ===
"You still owe me from last time!"
~ SetStoryFlag("sarah_angry")
-> END

=== money_borrowed ===
"Sure, just pay me back soon, okay?"
-> END

=== moving_help ===
"I'd be happy to help! When are you moving?"
-> END

=== congratulations ===
"Thanks! That means a lot to me."
-> END

=== subject_change ===
"Anyway, what's new with you?"
-> END

=== positive_catchup ===
"That's wonderful! Tell me more!"
-> END

=== negative_catchup ===
"Oh no, what's wrong? Want to talk about it?"
~ SetStoryFlag("sarah_concerned")
-> END

=== coffee_invite ===
"I'd love that! There's a new place downtown."
~ SetStoryFlag("coffee_date_planned")
-> END
