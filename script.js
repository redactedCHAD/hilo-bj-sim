document.addEventListener('DOMContentLoaded', () => {
    const NUM_DECKS = 6;
    const RESHUFFLE_PENETRATION = 0.25; // Reshuffle when 25% of cards remain

    const SUITS = ['H', 'D', 'C', 'S']; // Hearts, Diamonds, Clubs, Spades
    const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

    let shoe = [];
    let playerHand = [];
    let dealerHand = [];
    let playerSplitHand = []; // For when player splits
    let isSplitHandActive = false; // To track which hand is being played after a split

    let runningCount = 0;
    let cardsDealtSinceShuffle = 0;

    let gamePhase = 'INIT'; // INIT, INPUT_GUESSES, PLAYER_ACTION, DEALER_ACTION, HAND_OVER

    // DOM Elements
    const dealerCardsEl = document.getElementById('dealer-cards');
    const playerCardsEl = document.getElementById('player-cards');
    const playerSplitCardsEl = document.getElementById('player-cards-split');
    const splitHandAreaEl = document.getElementById('split-hand-area');
    
    const dealerScoreEl = document.getElementById('dealer-score');
    const playerScoreEl = document.getElementById('player-score');
    const playerSplitScoreEl = document.getElementById('player-score-split');

    const messageEl = document.getElementById('message');
    const rcFeedbackEl = document.getElementById('rc-feedback');
    const bsFeedbackEl = document.getElementById('bs-feedback');
    const runningCountGuessInput = document.getElementById('running-count-guess');
    const strategyGuessInput = document.getElementById('strategy-guess');
    const cardsRemainingEl = document.getElementById('cards-remaining');
    const decksRemainingEl = document.getElementById('decks-remaining');
    const penetrationDisplayEl = document.getElementById('penetration-display');
    const trueCountDisplayEl = document.getElementById('true-count-display');
    const trueCountValueEl = document.getElementById('true-count-value');


    const hitBtn = document.getElementById('hit-btn');
    const standBtn = document.getElementById('stand-btn');
    const doubleBtn = document.getElementById('double-btn');
    const splitBtn = document.getElementById('split-btn');
    const nextHandBtn = document.getElementById('next-hand-btn');
    const submitGuessesBtn = document.getElementById('submit-guesses-btn');
    const toggleTrueCountBtn = document.getElementById('toggle-true-count-btn');

    // --- Card and Shoe Logic ---
    function createCard(suit, rank) {
        let value;
        let countValue;
        if (['T', 'J', 'Q', 'K'].includes(rank)) {
            value = 10;
            countValue = -1;
        } else if (rank === 'A') {
            value = 11; // Ace can be 1 or 11
            countValue = -1;
        } else {
            value = parseInt(rank);
            if (value >= 2 && value <= 6) countValue = 1;
            else if (value >= 7 && value <= 9) countValue = 0;
        }
        return { suit, rank, value, countValue, display: rank + suit, hidden: false };
    }

    function createShoe() {
        shoe = [];
        for (let i = 0; i < NUM_DECKS; i++) {
            for (const suit of SUITS) {
                for (const rank of RANKS) {
                    shoe.push(createCard(suit, rank));
                }
            }
        }
        shuffleShoe();
        runningCount = 0; // Reset running count on new shoe
        cardsDealtSinceShuffle = 0;
        penetrationDisplayEl.textContent = `~${RESHUFFLE_PENETRATION * 100}%`;
        console.log("Shoe reshuffled. Running count reset to 0.");
    }

    function shuffleShoe() {
        for (let i = shoe.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
        }
    }

    function dealCard(hand, isVisible = true) {
        if (shoe.length === 0) {
            messageEl.textContent = "Shoe is empty! This shouldn't happen if penetration is working.";
            return null;
        }
        const card = shoe.pop();
        if (isVisible) { // Only count visible cards initially
             runningCount += card.countValue;
        }
        card.hidden = !isVisible;
        hand.push(card);
        cardsDealtSinceShuffle++;
        updateShoeInfo();
        return card;
    }

    function updateShoeInfo() {
        cardsRemainingEl.textContent = shoe.length;
        const decksLeft = shoe.length / 52;
        decksRemainingEl.textContent = decksLeft.toFixed(1);
        if (trueCountDisplayEl.style.display !== 'none') {
            trueCountValueEl.textContent = decksLeft > 0.5 ? (runningCount / decksLeft).toFixed(2) : "N/A";
        }
    }

    // --- Hand Value Logic ---
    function getHandValue(hand) {
        let value = 0;
        let aceCount = 0;
        for (const card of hand) {
            if (card.hidden) continue;
            value += card.value;
            if (card.rank === 'A') {
                aceCount++;
            }
        }
        while (value > 21 && aceCount > 0) {
            value -= 10;
            aceCount--;
        }
        return value;
    }

    function isBlackjack(hand) {
        return hand.length === 2 && getHandValue(hand) === 21;
    }

    // --- Basic Strategy (6 Decks, H17 - Dealer Hits Soft 17) ---
    // Returns 'H' (Hit), 'S' (Stand), 'D' (Double), 'P' (Split)
    function getBasicStrategy(playerHand, dealerUpCard) {
        const pValue = getHandValue(playerHand);
        const dValue = dealerUpCard.value; // Ace is 11 here for dealer upcard check
        const isSoft = playerHand.some(c => c.rank === 'A') && pValue !== playerHand.reduce((sum, card) => sum + (card.rank === 'A' ? 1 : card.value), 0);
        const canDouble = playerHand.length === 2;

        // Pairs
        if (playerHand.length === 2 && playerHand[0].rank === playerHand[1].rank) {
            const pRank = playerHand[0].rank;
            if (pRank === 'A' || pRank === '8') return 'P';
            if (pRank === 'T' || pRank === 'J' || pRank === 'Q' || pRank === 'K') return 'S'; // Tens
            if (pRank === '9') return (dValue === 7 || dValue === 10 || dValue === 11) ? 'S' : 'P';
            if (pRank === '7') return (dValue >= 2 && dValue <= 7) ? 'P' : 'H';
            if (pRank === '6') return (dValue >= 2 && dValue <= 6) ? 'P' : 'H';
            if (pRank === '5') return (dValue >= 2 && dValue <= 9 && canDouble) ? 'D' : 'H'; // Treat as hard 10
            if (pRank === '4') return ((dValue === 5 || dValue === 6) && canDouble) ? 'P' : 'H'; // Some charts vary, often H. Split for DAS
            if (pRank === '3' || pRank === '2') return (dValue >= 2 && dValue <= 7) ? 'P' : 'H';
        }

        // Soft Totals (contains an Ace counted as 11)
        if (isSoft) {
            if (pValue >= 20) return 'S'; // A9, A8
            if (pValue === 19) return (dValue === 6 && canDouble) ? 'D' : 'S'; // A8 vs A7
            if (pValue === 18) { // A7
                if (dValue >= 9 && dValue <= 11) return 'H';
                if (dValue >= 2 && dValue <= 6 && canDouble) return 'D';
                return 'S';
            }
            if (pValue === 17) return (dValue >= 3 && dValue <= 6 && canDouble) ? 'D' : 'H'; // A6
            if (pValue === 16 || pValue === 15) return (dValue >= 4 && dValue <= 6 && canDouble) ? 'D' : 'H'; // A5, A4
            if (pValue === 14 || pValue === 13) return (dValue >= 5 && dValue <= 6 && canDouble) ? 'D' : 'H'; // A3, A2
        }

        // Hard Totals
        if (pValue >= 17) return 'S';
        if (pValue >= 13 && pValue <= 16) return (dValue >= 2 && dValue <= 6) ? 'S' : 'H';
        if (pValue === 12) return (dValue >= 4 && dValue <= 6) ? 'S' : 'H';
        if (pValue === 11) return canDouble ? 'D' : 'H';
        if (pValue === 10) return (dValue >= 2 && dValue <= 9 && canDouble) ? 'D' : 'H';
        if (pValue === 9) return (dValue >= 3 && dValue <= 6 && canDouble) ? 'D' : 'H';
        if (pValue <= 8) return 'H';

        return 'S'; // Should not reach here, but as a fallback
    }


    // --- Game Flow & UI ---
    function startNewHand() {
        if (shoe.length < (NUM_DECKS * 52 * RESHUFFLE_PENETRATION)) {
            messageEl.textContent = "Reshuffling the shoe...";
            createShoe();
        }

        playerHand = [];
        dealerHand = [];
        playerSplitHand = [];
        isSplitHandActive = false;
        splitHandAreaEl.style.display = 'none';
        document.getElementById('player-cards').classList.remove('active-hand');
        document.getElementById('player-cards-split').classList.remove('active-hand');


        // Deal initial cards
        dealCard(playerHand, true);
        dealCard(dealerHand, true); // Dealer's up card
        dealCard(playerHand, true);
        dealCard(dealerHand, false); // Dealer's hole card

        renderHands();
        updateScores();

        gamePhase = 'INPUT_GUESSES';
        messageEl.textContent = "Enter your Running Count and Basic Strategy guess.";
        rcFeedbackEl.textContent = '';
        bsFeedbackEl.textContent = '';
        runningCountGuessInput.value = '';
        strategyGuessInput.value = '';
        runningCountGuessInput.focus();

        updateButtonStates();

        if (isBlackjack(playerHand) || isBlackjack(dealerHand)) {
            revealDealerHoleCard();
            determineOutcome();
        }
    }

    function handleSubmitGuesses() {
        if (gamePhase !== 'INPUT_GUESSES') return;

        const rcGuess = parseInt(runningCountGuessInput.value);
        const bsGuess = strategyGuessInput.value.toUpperCase();

        // Check Running Count
        if (rcGuess === runningCount) {
            rcFeedbackEl.textContent = `Correct! (Actual: ${runningCount})`;
            rcFeedbackEl.className = 'feedback correct';
        } else {
            rcFeedbackEl.textContent = `Incorrect. Actual RC is ${runningCount}.`;
            rcFeedbackEl.className = 'feedback incorrect';
        }

        // Check Basic Strategy
        const dealerUpCard = dealerHand.find(card => !card.hidden);
        const correctBS = getBasicStrategy(playerHand, dealerUpCard);
        
        if (bsGuess === correctBS) {
            bsFeedbackEl.textContent = `Correct! (${correctBS})`;
            bsFeedbackEl.className = 'feedback correct';
        } else {
            bsFeedbackEl.textContent = `Incorrect. Correct play is ${correctBS}.`;
            bsFeedbackEl.className = 'feedback incorrect';
        }
        
        gamePhase = 'PLAYER_ACTION';
        messageEl.textContent = "Your turn. Choose an action.";
        updateButtonStates();
    }


    function playerHit() {
        if (gamePhase !== 'PLAYER_ACTION') return;
        const currentHand = isSplitHandActive ? playerSplitHand : playerHand;
        dealCard(currentHand, true);
        renderHands();
        updateScores();

        const score = getHandValue(currentHand);
        if (score > 21) {
            messageEl.textContent = `Bust! ${isSplitHandActive ? "Split hand" : "Your hand"} value is ${score}.`;
            if (isSplitHandActive) {
                isSplitHandActive = false; // Move to main hand or dealer
                if(playerHand.length > 0 && getHandValue(playerHand) <= 21) { // If main hand still needs play
                    messageEl.textContent += " Playing main hand.";
                    document.getElementById('player-cards').classList.add('active-hand');
                    document.getElementById('player-cards-split').classList.remove('active-hand');
                    gamePhase = 'INPUT_GUESSES'; // Ask BS for main hand
                    rcFeedbackEl.textContent = '';
                    bsFeedbackEl.textContent = '';
                    runningCountGuessInput.value = ''; // Keep RC same
                    strategyGuessInput.value = '';
                    updateButtonStates();
                    return;
                }
            }
            // If both hands (if split) are bust or only one hand was played and busted
             if (!playerSplitHand.length || (getHandValue(playerHand) > 21 && getHandValue(playerSplitHand) > 21)) {
                endHand("Player busts.");
            } else if(playerSplitHand.length > 0 && getHandValue(playerSplitHand) <= 21 && getHandValue(playerHand) > 21){
                 // Main hand busted, split hand OK - continue play on split or end turn
                 // This logic is tricky, might need more states if split hand was played first
                playerStand(); // Effectively stand on the non-busted split hand
            } else {
                 playerStand(); // If one hand busted, other might be okay.
            }


        } else if (score === 21) {
            playerStand(); // Auto-stand on 21
        }
        // Disable double/split after hit
        doubleBtn.disabled = true;
        splitBtn.disabled = true;
    }

    function playerStand() {
        if (gamePhase !== 'PLAYER_ACTION') return;

        if (isSplitHandActive) {
            // Finished with split hand, move to main hand if it needs playing
            isSplitHandActive = false;
             if (playerHand.length > 0 && getHandValue(playerHand) <=21 && playerHand.length < 2 ) { // Check if main hand actually exists and needs play (e.g. got 1 card after split)
                 dealCard(playerHand, true); // Auto deal second card to main hand after split if not already there
                 renderHands();
                 updateScores();
                 if (isBlackjack(playerHand)) {
                    // if main hand is now blackjack, stand on it. Then dealer plays.
                    dealerTurn();
                    return;
                 }
            }
            // if main hand already played or busted or is blackjack
            if (playerHand.length >= 2 || getHandValue(playerHand) > 21) {
                dealerTurn();
            } else {
                 messageEl.textContent = "Playing main hand after split. Enter guesses.";
                 document.getElementById('player-cards').classList.add('active-hand');
                 document.getElementById('player-cards-split').classList.remove('active-hand');
                 gamePhase = 'INPUT_GUESSES';
                 rcFeedbackEl.textContent = '';
                 bsFeedbackEl.textContent = '';
                 strategyGuessInput.value = '';
                 updateButtonStates();
            }
        } else if (playerSplitHand.length > 0 && getHandValue(playerSplitHand) <= 21 && playerSplitHand.length < 2) {
            // Finished with main hand, split hand exists and needs playing
            isSplitHandActive = true;
            dealCard(playerSplitHand, true); // Auto deal second card to split hand
            renderHands();
            updateScores();
            if(isBlackjack(playerSplitHand)) {
                // if split hand is blackjack, stand on it. Then move to main hand or dealer
                isSplitHandActive = false;
                if(playerHand.length > 0 && getHandValue(playerHand) <=21 && playerHand.length < 2) {
                     dealCard(playerHand, true);
                     renderHands(); updateScores();
                     if(isBlackjack(playerHand)){
                         dealerTurn(); return;
                     }
                     messageEl.textContent = "Playing main hand. Enter guesses.";
                     gamePhase = 'INPUT_GUESSES'; updateButtonStates(); return;
                } else {
                    dealerTurn(); return;
                }
            }
            messageEl.textContent = "Playing split hand. Enter guesses.";
            document.getElementById('player-cards-split').classList.add('active-hand');
            document.getElementById('player-cards').classList.remove('active-hand');
            gamePhase = 'INPUT_GUESSES';
            rcFeedbackEl.textContent = '';
            bsFeedbackEl.textContent = '';
            strategyGuessInput.value = '';
            updateButtonStates();
        } else {
            // No split, or both split hands played
            dealerTurn();
        }
    }

    function playerDouble() {
        if (gamePhase !== 'PLAYER_ACTION') return;
        const currentHand = isSplitHandActive ? playerSplitHand : playerHand;
        if (currentHand.length !== 2) return; // Can only double on first two cards

        dealCard(currentHand, true);
        renderHands();
        updateScores();

        const score = getHandValue(currentHand);
        if (score > 21) {
            messageEl.textContent = `Bust on double! ${isSplitHandActive ? "Split hand" : "Your hand"} value is ${score}.`;
             if (isSplitHandActive) {
                isSplitHandActive = false;
                if(playerHand.length > 0 && getHandValue(playerHand) <= 21) {
                    messageEl.textContent += " Playing main hand.";
                     document.getElementById('player-cards').classList.add('active-hand');
                     document.getElementById('player-cards-split').classList.remove('active-hand');
                    gamePhase = 'INPUT_GUESSES'; updateButtonStates(); return;
                }
            }
            endHand("Player busts on double.");
        } else {
            playerStand(); // After double, player automatically stands
        }
    }

    function playerSplit() {
        if (gamePhase !== 'PLAYER_ACTION') return;
        if (playerHand.length !== 2 || playerHand[0].rank !== playerHand[1].rank || playerSplitHand.length > 0) {
            messageEl.textContent = "Cannot split.";
            return;
        }

        playerSplitHand.push(playerHand.pop()); // Move one card to split hand
        splitHandAreaEl.style.display = 'block';

        // Deal one card to each new hand
        dealCard(playerHand, true);
        dealCard(playerSplitHand, true);
        
        renderHands();
        updateScores();

        isSplitHandActive = false; // Start with the first hand (original playerHand)
        document.getElementById('player-cards').classList.add('active-hand');
        document.getElementById('player-cards-split').classList.remove('active-hand');

        messageEl.textContent = "Split successful. Playing first hand. Enter guesses.";
        gamePhase = 'INPUT_GUESSES'; // Re-ask for guesses for the first split hand
        rcFeedbackEl.textContent = ''; // RC doesn't change, but clear feedback
        bsFeedbackEl.textContent = '';
        strategyGuessInput.value = '';
        updateButtonStates();

        // Check for blackjack on split Aces (usually only gets one card)
        if (playerHand[0].rank === 'A') {
            // Typically, if you split Aces, you only get one more card on each.
            // And if that card is a 10, it's 21, not Blackjack.
            // For simplicity here, if we get 21 on split Aces, we'll auto-stand that hand.
            if (getHandValue(playerHand) === 21) {
                // Auto-stand on this hand, then move to prompt for the split hand
                messageEl.textContent = "First split hand is 21. Moving to second split hand. Enter guesses.";
                isSplitHandActive = true; // Move to the split hand next
                document.getElementById('player-cards-split').classList.add('active-hand');
                document.getElementById('player-cards').classList.remove('active-hand');
                // No playerStand() call here, just set up for next guess input
            }
            if (getHandValue(playerSplitHand) === 21 && playerHand[0].rank === 'A') {
                 // If both are 21 after splitting Aces, then dealer turn
                 if (getHandValue(playerHand) === 21) {
                    dealerTurn();
                    return;
                 }
                 // else, the first hand (playerHand) still needs its INPUT_GUESSES cycle.
            }
        }
    }

    function dealerTurn() {
        gamePhase = 'DEALER_ACTION';
        revealDealerHoleCard();
        updateButtonStates();
        messageEl.textContent = "Dealer's turn...";

        // Check if player busted on all hands
        const playerBusted = getHandValue(playerHand) > 21;
        const splitHandPlayed = playerSplitHand.length > 0;
        const splitHandBusted = splitHandPlayed ? getHandValue(playerSplitHand) > 21 : true; // true if no split hand

        if (playerBusted && (splitHandBusted || !splitHandPlayed)) {
            determineOutcome();
            return;
        }

        // Dealer plays (H17: Hits on Soft 17)
        setTimeout(() => { // Add slight delay for reveal
            let dealerScore = getHandValue(dealerHand);
            while (dealerScore < 17 || (dealerScore === 17 && dealerHand.some(c => c.rank === 'A' && dealerScore !== dealerHand.reduce((sum, card) => sum + (card.rank === 'A' ? 1 : card.value), 0)))) {
                if (shoe.length === 0) break; // Should not happen
                dealCard(dealerHand, true);
                renderHands();
                dealerScore = getHandValue(dealerHand);
                updateScores();
                if (dealerScore > 21) break;
            }
            determineOutcome();
        }, 1000);
    }
    
    function revealDealerHoleCard() {
        const holeCard = dealerHand.find(card => card.hidden);
        if (holeCard) {
            holeCard.hidden = false;
            runningCount += holeCard.countValue; // Count hole card now
            updateShoeInfo(); // Reflect count change
            renderHands();
            updateScores();
        }
    }

    function determineOutcome() {
        gamePhase = 'HAND_OVER';
        revealDealerHoleCard(); // Ensure it's revealed if not already
        
        let finalMessage = "";

        function getHandResult(pHand, dHand, handName) {
            const pScore = getHandValue(pHand);
            const dScore = getHandValue(dHand);
            let resultMsg = `${handName}: `;

            if (pScore > 21) {
                resultMsg += `Bust (${pScore}). Dealer wins.`;
            } else if (isBlackjack(pHand) && pHand.length === 2) { // Natural Blackjack
                if (isBlackjack(dHand) && dHand.length === 2) {
                    resultMsg += `Blackjack! Push (${pScore}).`;
                } else {
                    resultMsg += `Blackjack! Player wins 3:2! (${pScore}).`;
                }
            } else if (dScore > 21) {
                resultMsg += `Player wins! Dealer busts (${dScore}). Your score: ${pScore}.`;
            } else if (pScore > dScore) {
                resultMsg += `Player wins! (${pScore} vs ${dScore}).`;
            } else if (dScore > pScore) {
                resultMsg += `Dealer wins. (${dScore} vs ${pScore}).`;
            } else { // Push
                resultMsg += `Push! (${pScore}).`;
            }
            return resultMsg;
        }

        finalMessage = getHandResult(playerHand, dealerHand, "Main Hand");

        if (playerSplitHand.length > 0) {
            finalMessage += "<br>" + getHandResult(playerSplitHand, dealerHand, "Split Hand");
        }
        
        messageEl.innerHTML = finalMessage; // Use innerHTML for <br>
        updateButtonStates();
    }


    function endHand(reason) {
        gamePhase = 'HAND_OVER';
        revealDealerHoleCard();
        messageEl.textContent = reason;
        updateButtonStates();
    }

    function renderHands() {
        dealerCardsEl.innerHTML = dealerHand.map(card => 
            `<div class="card ${card.hidden ? 'hidden' : ''}">${card.hidden ? '??' : card.display}</div>`
        ).join('');
        playerCardsEl.innerHTML = playerHand.map(card => 
            `<div class="card">${card.display}</div>`
        ).join('');
        if (playerSplitHand.length > 0) {
            playerSplitCardsEl.innerHTML = playerSplitHand.map(card =>
                `<div class="card">${card.display}</div>`
            ).join('');
        } else {
            playerSplitCardsEl.innerHTML = '';
        }
    }

    function updateScores() {
        dealerScoreEl.textContent = getHandValue(dealerHand);
        playerScoreEl.textContent = getHandValue(playerHand);
        if (playerSplitHand.length > 0) {
            playerSplitScoreEl.textContent = getHandValue(playerSplitHand);
        } else {
            playerSplitScoreEl.textContent = '0';
        }
    }
    
    function updateButtonStates() {
        const canSplit = playerHand.length === 2 && playerHand[0].rank === playerHand[1].rank && playerSplitHand.length === 0 && !isSplitHandActive;
        const canDoubleCheckHand = isSplitHandActive ? playerSplitHand : playerHand;
        const canDouble = canDoubleCheckHand.length === 2;

        hitBtn.disabled = gamePhase !== 'PLAYER_ACTION';
        standBtn.disabled = gamePhase !== 'PLAYER_ACTION';
        doubleBtn.disabled = gamePhase !== 'PLAYER_ACTION' || !canDouble;
        splitBtn.disabled = gamePhase !== 'PLAYER_ACTION' || !canSplit;
        
        submitGuessesBtn.disabled = gamePhase !== 'INPUT_GUESSES';
        nextHandBtn.disabled = gamePhase === 'PLAYER_ACTION' || gamePhase === 'DEALER_ACTION' || gamePhase === 'INPUT_GUESSES';

        // Highlight active hand if split
        if (playerSplitHand.length > 0 && gamePhase === 'PLAYER_ACTION') {
            if (isSplitHandActive) {
                document.getElementById('player-cards-split').classList.add('active-hand');
                document.getElementById('player-cards').classList.remove('active-hand');
            } else {
                document.getElementById('player-cards').classList.add('active-hand');
                document.getElementById('player-cards-split').classList.remove('active-hand');
            }
        } else {
            document.getElementById('player-cards').classList.remove('active-hand');
            document.getElementById('player-cards-split').classList.remove('active-hand');
        }
    }

    // Event Listeners
    nextHandBtn.addEventListener('click', startNewHand);
    submitGuessesBtn.addEventListener('click', handleSubmitGuesses);
    hitBtn.addEventListener('click', playerHit);
    standBtn.addEventListener('click', playerStand);
    doubleBtn.addEventListener('click', playerDouble);
    splitBtn.addEventListener('click', playerSplit);
    toggleTrueCountBtn.addEventListener('click', () => {
        trueCountDisplayEl.style.display = trueCountDisplayEl.style.display === 'none' ? 'block' : 'none';
        if (trueCountDisplayEl.style.display !== 'none') updateShoeInfo(); // Update it if shown
    });

    // Initial setup
    createShoe();
    updateShoeInfo();
    updateButtonStates(); // Initial state of buttons
    messageEl.textContent = 'Welcome! Click "Next Hand" to start.';
});
