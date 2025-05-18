document.addEventListener('DOMContentLoaded', () => {
    const NUM_DECKS = 6;
    const RESHUFFLE_PENETRATION = 0.25;

    const SUITS = ['H', 'D', 'C', 'S'];
    const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

    let shoe = [];
    let playerHand = [];
    let dealerHand = [];
    let playerSplitHand = [];
    let isSplitHandActive = false;

    let runningCount = 0;
    let cardsDealtSinceShuffle = 0;
    let isLiveRcRevealed = false; // For the new RC reveal feature

    let gamePhase = 'INIT';

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
    const trueCountValueEl = document.getElementById('true-count-value');
    const deviationInfoEl = document.getElementById('deviation-info'); // New

    // *** NEW: Live RC Elements ***
    const liveRcValueEl = document.getElementById('live-rc-value');
    const revealRcBtn = document.getElementById('reveal-rc-btn');

    const hitBtn = document.getElementById('hit-btn');
    const standBtn = document.getElementById('stand-btn');
    const doubleBtn = document.getElementById('double-btn');
    const splitBtn = document.getElementById('split-btn');
    const nextHandBtn = document.getElementById('next-hand-btn');
    const submitGuessesBtn = document.getElementById('submit-guesses-btn');

    // --- Basic Strategy Deviations (Illustrious 18 subset for H17, 6 Decks) ---
    // Key: "PlayerSituation_vs_DealerUpCardRank" (e.g., H16_T, S18_6, P8_5, PA_T)
    // PlayerSituation: H<value>, S<value>, P<rank_char> (T for Ten)
    // DealerUpCardRank: 2-9, T, A
    // Play: H, S, D, P. For Insurance: Y/N (Yes/No)
    const DEVIATIONS_H17_6D = {
        // Insurance is a special case, usually prompted if dealer has Ace
        "INSURANCE_A": { tcThreshold: 3, play: 'Y', bsPlay: 'N', condition: '>=', note: "Take Insurance" },
        "H16_T": { tcThreshold: 0, play: 'S', bsPlay: 'H', condition: '>=', note: "Stand with 16 vs 10" },
        "H15_T": { tcThreshold: 4, play: 'S', bsPlay: 'H', condition: '>=', note: "Stand with 15 vs 10" },
        "PT_5":  { tcThreshold: 5, play: 'P', bsPlay: 'S', condition: '>=', note: "Split Tens vs 5" }, // Pair of Tens
        "PT_6":  { tcThreshold: 4, play: 'P', bsPlay: 'S', condition: '>=', note: "Split Tens vs 6" }, // Pair of Tens
        "H10_T": { tcThreshold: 4, play: 'D', bsPlay: 'H', condition: '>=', note: "Double 10 vs 10" },
        "H10_A": { tcThreshold: 4, play: 'D', bsPlay: 'H', condition: '>=', note: "Double 10 vs Ace" },
        "H12_3": { tcThreshold: 2, play: 'S', bsPlay: 'H', condition: '>=', note: "Stand 12 vs 3" },
        "H12_2": { tcThreshold: 3, play: 'S', bsPlay: 'H', condition: '>=', note: "Stand 12 vs 2" },
        "H11_A": { tcThreshold: 1, play: 'D', bsPlay: 'H', condition: '>=', note: "Double 11 vs Ace" },
        "H9_2":  { tcThreshold: 1, play: 'D', bsPlay: 'H', condition: '>=', note: "Double 9 vs 2" },
        "H9_7":  { tcThreshold: 3, play: 'D', bsPlay: 'H', condition: '>=', note: "Double 9 vs 7" },
        "H13_2": { tcThreshold: -1, play: 'S', bsPlay: 'H', condition: '<=', note: "Stand 13 vs 2" },
        "H12_4": { tcThreshold: 0, play: 'S', bsPlay: 'H', condition: '<=', note: "Stand 12 vs 4" },
        "H12_5": { tcThreshold: -2, play: 'S', bsPlay: 'H', condition: '<=', note: "Stand 12 vs 5" },
        "H12_6": { tcThreshold: -1, play: 'S', bsPlay: 'H', condition: '<=', note: "Stand 12 vs 6" },
    };


    // --- Card and Shoe Logic ---
    function createCard(suit, rank) {
        let value;
        let countValue;
        if (['T', 'J', 'Q', 'K'].includes(rank)) {
            value = 10;
            countValue = -1;
        } else if (rank === 'A') {
            value = 11;
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
        runningCount = 0;
        cardsDealtSinceShuffle = 0;
        penetrationDisplayEl.textContent = `~${RESHUFFLE_PENETRATION * 100}%`;
        updateLiveRcDisplay(); // Update new RC display
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
            messageEl.textContent = "Shoe is empty! Reshuffling needed.";
            createShoe(); // Auto-reshuffle if somehow empty
            if(shoe.length === 0) return null; // Still empty, major issue
        }
        const card = shoe.pop();
        if (isVisible) {
             runningCount += card.countValue;
        }
        card.hidden = !isVisible;
        hand.push(card);
        cardsDealtSinceShuffle++;
        updateShoeInfo();
        updateLiveRcDisplay(); // Update new RC display
        return card;
    }
    
    // *** NEW: Update Live Running Count Display ***
    function updateLiveRcDisplay() {
        if (isLiveRcRevealed) {
            liveRcValueEl.textContent = runningCount;
        } else {
            liveRcValueEl.textContent = '???';
        }
    }

    // *** NEW: Toggle Live RC Reveal ***
    revealRcBtn.addEventListener('click', () => {
        isLiveRcRevealed = !isLiveRcRevealed;
        updateLiveRcDisplay();
        revealRcBtn.textContent = isLiveRcRevealed ? '🙈' : '👁️';
    });


    function updateShoeInfo() {
        cardsRemainingEl.textContent = shoe.length;
        const decksLeft = shoe.length / 52;
        decksRemainingEl.textContent = decksLeft.toFixed(1);
        const currentTrueCount = calculateTrueCount();
        trueCountValueEl.textContent = currentTrueCount === null ? "N/A" : currentTrueCount.toFixed(2);

    }

    function calculateTrueCount() {
        const decksLeft = shoe.length / 52;
        if (decksLeft < 0.25) return null; // Avoid extreme TC with few cards if not reshuffled yet
        return runningCount / decksLeft;
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

    // --- Basic Strategy (6 Decks, H17) ---
    // (This function remains largely the same, it returns the pure BS play)
    function getBasicStrategy(playerHand, dealerUpCard) {
        const pValue = getHandValue(playerHand);
        const dValue = dealerUpCard.value;
        const isSoft = playerHand.some(c => c.rank === 'A' && c.value === 11 && pValue !== playerHand.reduce((sum, card) => sum + (card.rank === 'A' ? 1 : card.value), 0) + (playerHand.filter(c=>c.rank === 'A').length * 10) );

        const canDouble = playerHand.length === 2;

        // Pairs
        if (playerHand.length === 2 && playerHand[0].rank === playerHand[1].rank) {
            const pRank = playerHand[0].rank; // Ace is 11 here
            if (pRank === 'A' || pRank === '8') return 'P';
            if (['T', 'J', 'Q', 'K'].includes(pRank)) return 'S';
            if (pRank === '9') return (dValue === 7 || dValue === 10 || dValue === 11) ? 'S' : 'P';
            if (pRank === '7') return (dValue >= 2 && dValue <= 7) ? 'P' : 'H';
            if (pRank === '6') return (dValue >= 2 && dValue <= 6) ? 'P' : 'H';
            if (pRank === '5') return (dValue >= 2 && dValue <= 9 && canDouble) ? 'D' : 'H';
            if (pRank === '4') return ((dValue === 5 || dValue === 6) && canDouble) ? 'P' : 'H'; // DAS-dependent, H for noDAS
            if (pRank === '3' || pRank === '2') return (dValue >= 2 && dValue <= 7) ? 'P' : 'H';
        }

        // Soft Totals
        if (isSoft) {
            if (pValue >= 20) return 'S'; // A9 (20), A8 (19)
            if (pValue === 19) return (dValue === 6 && canDouble) ? 'D' : 'S'; // A8
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

        return 'S';
    }

    // *** NEW: Helper to get situation key for deviations ***
    function getSituationKey(playerHand, dealerUpCard) {
        const pValue = getHandValue(playerHand);
        const dRank = dealerUpCard.rank === 'T' || dealerUpCard.rank === 'J' || dealerUpCard.rank === 'Q' || dealerUpCard.rank === 'K' ? 'T' : dealerUpCard.rank;

        if (dealerUpCard.rank === 'A' && playerHand.length === 2) { // Check for Insurance special case
             return `INSURANCE_A`;
        }

        if (playerHand.length === 2 && playerHand[0].rank === playerHand[1].rank) {
            let pRankChar = playerHand[0].rank;
            if (['J', 'Q', 'K'].includes(pRankChar)) pRankChar = 'T'; // Group Tens
            return `P${pRankChar}_${dRank}`;
        }

        const isSoft = playerHand.some(c => c.rank === 'A' && c.value === 11 && pValue !== playerHand.reduce((sum, card) => sum + (card.rank === 'A' ? 1 : card.value), 0) + (playerHand.filter(c=>c.rank === 'A').length * 10) );

        if (isSoft) {
            return `S${pValue}_${dRank}`;
        } else {
            return `H${pValue}_${dRank}`;
        }
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


        dealCard(playerHand, true);
        dealCard(dealerHand, true); 
        dealCard(playerHand, true);
        dealCard(dealerHand, false);

        renderHands();
        updateScores();
        updateShoeInfo(); // Update TC display

        gamePhase = 'INPUT_GUESSES';
        messageEl.textContent = "Enter your Running Count and Basic Strategy guess.";
        rcFeedbackEl.textContent = '';
        bsFeedbackEl.textContent = '';
        deviationInfoEl.textContent = ''; // Clear deviation info
        runningCountGuessInput.value = '';
        strategyGuessInput.value = '';
        runningCountGuessInput.focus();

        updateButtonStates();
        updateLiveRcDisplay(); // Ensure live RC is updated/obscured

        // Check for Insurance situation
        if (dealerHand[0].rank === 'A' && !dealerHand[0].hidden) {
            const trueCount = calculateTrueCount();
            const insuranceDeviation = DEVIATIONS_H17_6D["INSURANCE_A"];
            if (trueCount !== null && insuranceDeviation && trueCount >= insuranceDeviation.tcThreshold) {
                 deviationInfoEl.textContent = `Deviation Alert: ${insuranceDeviation.note} (TC: ${trueCount.toFixed(1)} >= ${insuranceDeviation.tcThreshold}). BS says No.`;
                 deviationInfoEl.className = 'feedback info';
            } else {
                 deviationInfoEl.textContent = `Dealer shows Ace. BS: No Insurance. (Take if TC >= ${insuranceDeviation ? insuranceDeviation.tcThreshold : '+3'})`;
                 deviationInfoEl.className = 'feedback info';
            }
        }


        if (isBlackjack(playerHand) || isBlackjack(dealerHand)) {
            // RC for hole card happens on reveal
            // No deviation check needed for Blackjack, outcome is fixed.
            revealDealerHoleCard(); // This will update RC and live RC
            determineOutcome();
        }
    }

    function handleSubmitGuesses() {
        if (gamePhase !== 'INPUT_GUESSES') return;

        const rcGuess = parseInt(runningCountGuessInput.value);
        const bsGuess = strategyGuessInput.value.toUpperCase();

        // Check Running Count (based on VISIBLE cards at time of guess)
        let visibleRc = 0;
        [...playerHand, ...dealerHand.filter(c => !c.hidden)].forEach(card => visibleRc += card.countValue);
        // Note: The global 'runningCount' variable already reflects this state before hole card is revealed.

        if (rcGuess === runningCount) {
            rcFeedbackEl.textContent = `Correct! (Actual RC before hole card: ${runningCount})`;
            rcFeedbackEl.className = 'feedback correct';
        } else {
            rcFeedbackEl.textContent = `Incorrect. Actual RC (before hole card) is ${runningCount}.`;
            rcFeedbackEl.className = 'feedback incorrect';
        }

        // Check Basic Strategy & Deviations
        const dealerUpCard = dealerHand.find(card => !card.hidden);
        if (!dealerUpCard) { // Should not happen in INPUT_GUESSES phase
            bsFeedbackEl.textContent = "Error: Dealer up-card not found.";
            bsFeedbackEl.className = 'feedback incorrect';
            return;
        }

        const currentTrueCount = calculateTrueCount();
        const situationKey = getSituationKey(playerHand, dealerUpCard);
        const correctBS = getBasicStrategy(playerHand, dealerUpCard);
        let recommendedPlay = correctBS;
        let isDeviation = false;
        let deviationDetails = "";

        const deviationRule = DEVIATIONS_H17_6D[situationKey];

        if (deviationRule && currentTrueCount !== null) {
            let deviationApplies = false;
            if (deviationRule.condition === '>=') {
                deviationApplies = currentTrueCount >= deviationRule.tcThreshold;
            } else if (deviationRule.condition === '<=') {
                deviationApplies = currentTrueCount <= deviationRule.tcThreshold;
            }

            if (deviationApplies) {
                recommendedPlay = deviationRule.play;
                isDeviation = true;
                deviationDetails = `(Deviation: ${deviationRule.note} at TC ${currentTrueCount.toFixed(1)} vs threshold ${deviationRule.tcThreshold}. BS was ${correctBS}.)`;
            } else {
                 deviationDetails = `(No deviation. BS is ${correctBS}. For ${situationKey}, ${deviationRule.note} at TC ${deviationRule.condition} ${deviationRule.tcThreshold}.)`;
            }
        } else if (situationKey.startsWith("INSURANCE")) { // Handle insurance messaging if not already covered
            // This is mostly handled in startNewHand, but good to have a fallback.
            recommendedPlay = 'N'; // BS for insurance is No, unless TC high
            if (DEVIATIONS_H17_6D["INSURANCE_A"] && currentTrueCount !== null && currentTrueCount >= DEVIATIONS_H17_6D["INSURANCE_A"].tcThreshold) {
                recommendedPlay = 'Y';
                isDeviation = true;
                deviationDetails = `(Deviation: Take Insurance at TC ${currentTrueCount.toFixed(1)}. BS was N.)`;
            } else {
                deviationDetails = `(BS for Insurance: N. Take if TC >= ${DEVIATIONS_H17_6D["INSURANCE_A"] ? DEVIATIONS_H17_6D["INSURANCE_A"].tcThreshold : '+3'})`;
            }
             // User input for insurance is not 'Y'/'N', so this is informational.
             // We'll just compare their H/S/D/P guess to the BS for the hand.
            recommendedPlay = correctBS; // Revert to BS for hand action for comparison
            isDeviation = false; // Clear deviation flag for hand action
            if (dealerHand[0].rank === 'A') { // Only provide insurance specific feedback if Ace is showing
                bsFeedbackEl.innerHTML = `For Insurance: ${deviationDetails} <br>For Hand Action (${playerScoreEl.textContent} vs A): `;
            } else {
                bsFeedbackEl.innerHTML = ""; // Clear if not insurance situation
            }
        }


        if (bsGuess === recommendedPlay) {
            bsFeedbackEl.innerHTML += `Your play '${bsGuess}' is Correct! ${isDeviation ? 'This is a DEVIATION.' : '(Basic Strategy)'} <br><small>${deviationDetails}</small>`;
            bsFeedbackEl.className = 'feedback correct';
        } else {
            bsFeedbackEl.innerHTML += `Your play '${bsGuess}' is Incorrect. Correct is '${recommendedPlay}'. ${isDeviation ? 'This was a DEVIATION.' : '(Basic Strategy)'} <br><small>${deviationDetails}</small> BS was ${correctBS}.`;
            bsFeedbackEl.className = 'feedback incorrect';
        }
        
        if (!deviationDetails && !situationKey.startsWith("INSURANCE")) { // If no deviation was applicable or checked.
             bsFeedbackEl.innerHTML += ` Basic Strategy is '${correctBS}'.`;
        }


        // Clear general deviation info if BS feedback covers it or not applicable
        if (dealerHand[0].rank !== 'A' || situationKey !== "INSURANCE_A") {
            deviationInfoEl.textContent = '';
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
        updateShoeInfo(); // Update TC

        const score = getHandValue(currentHand);
        if (score > 21) {
            // ... (bust logic remains same as before)
            messageEl.textContent = `Bust! ${isSplitHandActive ? "Split hand" : "Your hand"} value is ${score}.`;
            if (isSplitHandActive) {
                isSplitHandActive = false; 
                if(playerHand.length > 0 && getHandValue(playerHand) <= 21 && playerHand.length < 2 ) { // If main hand still needs play after split hand bust
                    messageEl.textContent += " Playing main hand.";
                     // Deal second card to main hand if needed
                    if (playerHand.length < 2) dealCard(playerHand, true);
                    renderHands(); updateScores(); updateShoeInfo();
                    document.getElementById('player-cards').classList.add('active-hand');
                    document.getElementById('player-cards-split').classList.remove('active-hand');
                    gamePhase = 'INPUT_GUESSES'; 
                    rcFeedbackEl.textContent = '';
                    bsFeedbackEl.textContent = '';
                    deviationInfoEl.textContent = '';
                    strategyGuessInput.value = '';
                    updateButtonStates();
                    return;
                } else if (playerHand.length > 0 && getHandValue(playerHand) <= 21) {
                     // Main hand already has 2+ cards, or was blackjack. Move to dealer or next action.
                    playerStand(); // Effectively stand on main hand if it's playable
                    return;
                }
            }
            
            const mainHandBusted = getHandValue(playerHand) > 21;
            const splitHandExistsAndBusted = playerSplitHand.length > 0 && getHandValue(playerSplitHand) > 21;
            const onlyHandBusted = playerSplitHand.length === 0 && mainHandBusted;

            if (onlyHandBusted || (mainHandBusted && splitHandExistsAndBusted) || (mainHandBusted && playerSplitHand.length === 0)) {
                endHand("Player busts.");
            } else {
                // If one hand busted (e.g. active hand), and other exists and is not busted, proceed.
                // This case is complex if first hand of split busts.
                // For now, playerStand() will try to handle moving to next phase/hand.
                playerStand(); 
            }
        } else if (score === 21) {
            playerStand(); 
        }
        doubleBtn.disabled = true;
        splitBtn.disabled = true;
    }

    function playerStand() {
        if (gamePhase !== 'PLAYER_ACTION') return;
        deviationInfoEl.textContent = ''; // Clear any previous deviation alerts

        if (isSplitHandActive) {
            isSplitHandActive = false;
            if (playerHand.length > 0 && getHandValue(playerHand) <= 21) {
                if (playerHand.length < 2) dealCard(playerHand, true); // Deal second card if needed
                renderHands(); updateScores(); updateShoeInfo();
                if (isBlackjack(playerHand) || getHandValue(playerHand) === 21) {
                    dealerTurn(); return;
                }
                messageEl.textContent = "Playing main hand after split. Enter guesses.";
                document.getElementById('player-cards').classList.add('active-hand');
                document.getElementById('player-cards-split').classList.remove('active-hand');
                gamePhase = 'INPUT_GUESSES';
                rcFeedbackEl.textContent = ''; bsFeedbackEl.textContent = ''; strategyGuessInput.value = '';
                updateButtonStates(); return;
            } else { // Main hand busted or doesn't exist
                dealerTurn(); return;
            }
        } else if (playerSplitHand.length > 0 && getHandValue(playerSplitHand) <= 21) {
             // Check if split hand needs to be played
            const splitHandValue = getHandValue(playerSplitHand);
            if (playerSplitHand.length < 2 || (splitHandValue < 21 && !isBlackjack(playerSplitHand))) {
                isSplitHandActive = true;
                if (playerSplitHand.length < 2) dealCard(playerSplitHand, true);
                renderHands(); updateScores(); updateShoeInfo();
                if (isBlackjack(playerSplitHand) || getHandValue(playerSplitHand) === 21) {
                    // Stand on split hand, then check main hand or dealer turn
                    isSplitHandActive = false; // Mark split hand as played
                    if (playerHand.length > 0 && getHandValue(playerHand) <= 21) {
                        if (playerHand.length < 2) dealCard(playerHand, true); // Deal to main if needed
                         renderHands(); updateScores(); updateShoeInfo();
                         if(isBlackjack(playerHand) || getHandValue(playerHand) === 21) {dealerTurn(); return;}

                        messageEl.textContent = "Playing main hand. Enter guesses.";
                        gamePhase = 'INPUT_GUESSES'; updateButtonStates(); return;
                    } else { dealerTurn(); return;} // Main hand done or busted
                }
                messageEl.textContent = "Playing split hand. Enter guesses.";
                document.getElementById('player-cards-split').classList.add('active-hand');
                document.getElementById('player-cards').classList.remove('active-hand');
                gamePhase = 'INPUT_GUESSES';
                rcFeedbackEl.textContent = ''; bsFeedbackEl.textContent = ''; strategyGuessInput.value = '';
                updateButtonStates(); return;
            } else { // Split hand already played (e.g. blackjack or 21) or busted
                 dealerTurn(); return;
            }
        } else {
            dealerTurn();
        }
    }

    function playerDouble() {
        if (gamePhase !== 'PLAYER_ACTION') return;
        const currentHand = isSplitHandActive ? playerSplitHand : playerHand;
        if (currentHand.length !== 2) return; 

        dealCard(currentHand, true);
        renderHands();
        updateScores();
        updateShoeInfo();

        const score = getHandValue(currentHand);
        if (score > 21) {
            messageEl.textContent = `Bust on double! ${isSplitHandActive ? "Split hand" : "Your hand"} value is ${score}.`;
             if (isSplitHandActive) {
                isSplitHandActive = false;
                if(playerHand.length > 0 && getHandValue(playerHand) <= 21) {
                     if (playerHand.length < 2) dealCard(playerHand, true);
                     renderHands(); updateScores(); updateShoeInfo();
                     if (isBlackjack(playerHand) || getHandValue(playerHand) === 21) { dealerTurn(); return;}
                    messageEl.textContent += " Playing main hand.";
                     document.getElementById('player-cards').classList.add('active-hand');
                     document.getElementById('player-cards-split').classList.remove('active-hand');
                    gamePhase = 'INPUT_GUESSES'; updateButtonStates(); return;
                }
            }
            endHand("Player busts on double.");
        } else {
            playerStand(); 
        }
    }

    function playerSplit() {
        if (gamePhase !== 'PLAYER_ACTION') return;
        if (playerHand.length !== 2 || playerHand[0].rank !== playerHand[1].rank || playerSplitHand.length > 0) {
            messageEl.textContent = "Cannot split.";
            return;
        }

        playerSplitHand.push(playerHand.pop()); 
        splitHandAreaEl.style.display = 'block';

        dealCard(playerHand, true);
        dealCard(playerSplitHand, true);
        
        renderHands();
        updateScores();
        updateShoeInfo();

        isSplitHandActive = false; 
        document.getElementById('player-cards').classList.add('active-hand');
        document.getElementById('player-cards-split').classList.remove('active-hand');

        messageEl.textContent = "Split successful. Playing first hand (main). Enter guesses.";
        gamePhase = 'INPUT_GUESSES'; 
        rcFeedbackEl.textContent = ''; 
        bsFeedbackEl.textContent = '';
        deviationInfoEl.textContent = '';
        strategyGuessInput.value = '';
        updateButtonStates();

        if (playerHand[0].rank === 'A') { // Special handling for splitting Aces
            // Typically, only one more card is dealt to each Ace, and play stands.
            // If either hand is 21, it's not Blackjack, just 21.
            // For simplicity, we'll treat it like any other split regarding further play options for now,
            // but the player will likely stand immediately. BS for A,X vs Dealer is usually stand.
            // If getHandValue(playerHand) === 21, it will auto-stand in the next playerStand or playerHit(21) call
        }
    }

    function dealerTurn() {
        gamePhase = 'DEALER_ACTION';
        revealDealerHoleCard(); // This updates RC and live RC
        updateButtonStates();
        messageEl.textContent = "Dealer's turn...";
        deviationInfoEl.textContent = ''; // Clear deviation info

        const playerBusted = getHandValue(playerHand) > 21;
        const splitHandPlayedAndBusted = playerSplitHand.length > 0 && getHandValue(playerSplitHand) > 21;
        const playerAllBusted = playerBusted && (playerSplitHand.length === 0 || splitHandPlayedAndBusted);

        if (playerAllBusted) {
            determineOutcome();
            return;
        }
        // Check if player still has hands in play
        const playerHasPlayableHand = (getHandValue(playerHand) <= 21) || (playerSplitHand.length > 0 && getHandValue(playerSplitHand) <= 21);
        if (!playerHasPlayableHand) {
            determineOutcome(); // All player hands are bust
            return;
        }


        setTimeout(() => { 
            let dealerScore = getHandValue(dealerHand);
            while (dealerScore < 17 || (dealerScore === 17 && dealerHand.some(c => c.rank === 'A' && c.value === 11 && dealerScore !== dealerHand.reduce((sum, card) => sum + (card.rank === 'A' ? 1 : card.value), 0) + (dealerHand.filter(c=>c.rank === 'A').length * 10)))) {
                if (shoe.length === 0) break; 
                dealCard(dealerHand, true); // Updates RC and live RC
                renderHands();
                dealerScore = getHandValue(dealerHand);
                updateScores();
                updateShoeInfo(); // update TC
                if (dealerScore > 21) break;
            }
            determineOutcome();
        }, 1000);
    }
    
    function revealDealerHoleCard() {
        const holeCard = dealerHand.find(card => card.hidden);
        if (holeCard) {
            holeCard.hidden = false;
            runningCount += holeCard.countValue; 
            updateShoeInfo(); 
            updateLiveRcDisplay(); // Update live RC after hole card revealed
            renderHands();
            updateScores();
        }
    }

    function determineOutcome() {
        gamePhase = 'HAND_OVER';
        if (dealerHand.some(c => c.hidden)) revealDealerHoleCard(); 
        
        let finalMessage = "";

        function getHandResult(pHand, dHand, handName) {
            const pScore = getHandValue(pHand);
            const dScore = getHandValue(dHand);
            let resultMsg = `${handName}: `;

            if (pScore > 21) {
                resultMsg += `Bust (${pScore}). Dealer wins.`;
            } else if (isBlackjack(pHand) && pHand.length === 2) {
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
            } else { 
                resultMsg += `Push! (${pScore}).`;
            }
            return resultMsg;
        }

        finalMessage = getHandResult(playerHand, dealerHand, "Main Hand");

        if (playerSplitHand.length > 0) {
            finalMessage += "<br>" + getHandResult(playerSplitHand, dealerHand, "Split Hand");
        }
        
        messageEl.innerHTML = finalMessage;
        updateButtonStates();
    }


    function endHand(reason) {
        gamePhase = 'HAND_OVER';
        if (dealerHand.some(c => c.hidden)) revealDealerHoleCard();
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
        const currentProcessingHand = isSplitHandActive ? playerSplitHand : playerHand;
        const canSplit = playerHand.length === 2 && playerHand[0].rank === playerHand[1].rank && playerSplitHand.length === 0 && !isSplitHandActive;
        const canDouble = currentProcessingHand.length === 2;

        hitBtn.disabled = gamePhase !== 'PLAYER_ACTION';
        standBtn.disabled = gamePhase !== 'PLAYER_ACTION';
        doubleBtn.disabled = gamePhase !== 'PLAYER_ACTION' || !canDouble;
        splitBtn.disabled = gamePhase !== 'PLAYER_ACTION' || !canSplit;
        
        submitGuessesBtn.disabled = gamePhase !== 'INPUT_GUESSES';
        nextHandBtn.disabled = ['PLAYER_ACTION', 'DEALER_ACTION', 'INPUT_GUESSES'].includes(gamePhase);


        if (playerSplitHand.length > 0 && (gamePhase === 'PLAYER_ACTION' || gamePhase === 'INPUT_GUESSES')) {
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

    // Initial setup
    createShoe();
    updateShoeInfo();
    updateButtonStates();
    updateLiveRcDisplay();
    messageEl.textContent = 'Welcome! Click "Next Hand" to start.';
});
