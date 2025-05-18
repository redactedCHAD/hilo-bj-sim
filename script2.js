document.addEventListener('DOMContentLoaded', () => {
    let CURRENT_NUM_DECKS = 6;
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
    let isLiveRcRevealed = false;
    let gamePhase = 'INIT';

    // *** NEW: Stats Variables ***
    let stats = {
        handsPlayed: 0,
        wins: 0,
        losses: 0,
        pushes: 0,
        blackjacks: 0,
        unitsBet: 0, // Total units wagered
        unitsNet: 0,  // Net units won/lost
        // For splits, we'll consider each hand as a separate outcome for win/loss/push count
        // but the initial bet applies to the original hand. Doubles will increase unitsBet for that hand.
    };

    // DOM Elements (get all of them, including new stat elements)
    const gameTitleEl = document.getElementById('game-title');
    const deckSelectEl = document.getElementById('deck-select');
    const resetStatsBtn = document.getElementById('reset-stats-btn'); // New

    const dealerCardsEl = document.getElementById('dealer-cards');
    const playerCardsEl = document.getElementById('player-cards');
    // ... (all other game elements as before) ...
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
    const deviationInfoEl = document.getElementById('deviation-info');
    const liveRcValueEl = document.getElementById('live-rc-value');
    const revealRcBtn = document.getElementById('reveal-rc-btn');
    const hitBtn = document.getElementById('hit-btn');
    const standBtn = document.getElementById('stand-btn');
    const doubleBtn = document.getElementById('double-btn');
    const splitBtn = document.getElementById('split-btn');
    const nextHandBtn = document.getElementById('next-hand-btn');
    const submitGuessesBtn = document.getElementById('submit-guesses-btn');

    // *** NEW: Stats & Edge DOM Elements ***
    const statHandsPlayedEl = document.getElementById('stat-hands-played');
    const statWinsEl = document.getElementById('stat-wins');
    const statWinPctEl = document.getElementById('stat-win-pct');
    const statLossesEl = document.getElementById('stat-losses');
    const statLossPctEl = document.getElementById('stat-loss-pct');
    const statPushesEl = document.getElementById('stat-pushes');
    const statPushPctEl = document.getElementById('stat-push-pct');
    const statBlackjacksEl = document.getElementById('stat-blackjacks');
    const statUnitsNetEl = document.getElementById('stat-units-net');
    const trueCountValueMainEl = document.getElementById('true-count-value-main'); // For new section
    const perceivedEdgeEl = document.getElementById('perceived-edge');
    const recommendedBetEl = document.getElementById('recommended-bet');


    const DEVIATIONS_MULTI_DECK_H17 = { /* ... (same as before) ... */ };

    // --- Card and Shoe Logic ---
    // createCard, shuffleShoe, dealCard (mostly same)
    function createCard(suit, rank) { /* ... (same) ... */
        let value; let countValue;
        if (['T', 'J', 'Q', 'K'].includes(rank)) { value = 10; countValue = -1; }
        else if (rank === 'A') { value = 11; countValue = -1; }
        else {
            value = parseInt(rank);
            if (value >= 2 && value <= 6) countValue = 1;
            else if (value >= 7 && value <= 9) countValue = 0;
        }
        return { suit, rank, value, countValue, display: rank + suit, hidden: false };
    }
    function createShoe() { /* ... (same, ensures CURRENT_NUM_DECKS is used) ... */
        shoe = [];
        for (let i = 0; i < CURRENT_NUM_DECKS; i++) {
            for (const suit of SUITS) { for (const rank of RANKS) { shoe.push(createCard(suit, rank)); } }
        }
        shuffleShoe(); runningCount = 0; cardsDealtSinceShuffle = 0;
        penetrationDisplayEl.textContent = `~${RESHUFFLE_PENETRATION * 100}% of ${CURRENT_NUM_DECKS * 52} cards`;
        updateLiveRcDisplay(); updateGameTitle();
        console.log(`Shoe with ${CURRENT_NUM_DECKS} decks reshuffled. RC reset.`);
    }
    function shuffleShoe() { /* ... (same) ... */
        for (let i = shoe.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[shoe[i], shoe[j]] = [shoe[j], shoe[i]]; }
    }
    function dealCard(hand, isVisible = true) { /* ... (same, ensure updateShoeInfo calls updateStatsAndEdgeDisplay) ... */
        if (shoe.length === 0) { createShoe(); if(shoe.length === 0) return null; }
        const card = shoe.pop();
        if (isVisible && !card.hidden) { runningCount += card.countValue; }
        card.hidden = !isVisible; hand.push(card); cardsDealtSinceShuffle++;
        updateShoeInfo(); updateLiveRcDisplay();
        return card;
    }
    
    function updateLiveRcDisplay() { /* ... (same) ... */
        liveRcValueEl.textContent = isLiveRcRevealed ? runningCount : '???';
    }
    revealRcBtn.addEventListener('click', () => { /* ... (same) ... */
        isLiveRcRevealed = !isLiveRcRevealed; updateLiveRcDisplay();
        revealRcBtn.textContent = isLiveRcRevealed ? '🙈' : '👁️';
    });

    function updateShoeInfo() {
        cardsRemainingEl.textContent = shoe.length;
        const decksLeft = shoe.length / 52;
        decksRemainingEl.textContent = decksLeft.toFixed(1);
        updateStatsAndEdgeDisplay(); // Call this to update TC, edge, bet
    }

    function calculateTrueCount() { /* ... (same) ... */
        const decksLeft = shoe.length / 52;
        if (decksLeft < 0.20) return null;
        return runningCount / decksLeft;
    }

    // --- Hand Value & BS Logic --- (getHandValue, isBlackjack, getBasicStrategy, specific BS charts, getSituationKey remain same)
    function getHandValue(hand) { /* ... (same) ... */
        let value = 0; let aceCount = 0;
        for (const card of hand) {
            if (card.hidden) continue; value += card.value; if (card.rank === 'A') aceCount++;
        }
        while (value > 21 && aceCount > 0) { value -= 10; aceCount--; }
        return value;
    }
    function isBlackjack(hand) { return hand.length === 2 && getHandValue(hand) === 21; }
    function getBasicStrategy(playerHand, dealerUpCard) { /* ... (same, calls deck-specific) ... */
        if (CURRENT_NUM_DECKS === 1) return getBasicStrategy_1D_H17(playerHand, dealerUpCard);
        else if (CURRENT_NUM_DECKS === 2) return getBasicStrategy_2D_H17(playerHand, dealerUpCard);
        else return getBasicStrategy_6D_H17(playerHand, dealerUpCard);
    }
    function getBasicStrategy_6D_H17(playerHand, dealerUpCard) { /* ... (same) ... */ }
    function getBasicStrategy_2D_H17(playerHand, dealerUpCard) { /* ... (same) ... */ }
    function getBasicStrategy_1D_H17(playerHand, dealerUpCard) { /* ... (same) ... */ }
    function getSituationKey(playerHand, dealerUpCard) { /* ... (same) ... */ }


    // --- Game Flow ---
    let currentBetUnits = { main: 0, split: 0 }; // Track units bet for current hand(s)

    function startNewHand() {
        if (shoe.length < (CURRENT_NUM_DECKS * 52 * RESHUFFLE_PENETRATION)) {
            messageEl.textContent = "Reshuffling the shoe..."; createShoe();
        } else { updateGameTitle(); }

        playerHand = []; dealerHand = []; playerSplitHand = [];
        isSplitHandActive = false;
        splitHandAreaEl.style.display = 'none';
        document.getElementById('player-cards').classList.remove('active-hand');
        document.getElementById('player-cards-split').classList.remove('active-hand');

        // *** Determine bet for this hand BEFORE cards are dealt for RC guess phase ***
        const tcForBetting = calculateTrueCount(); // TC before any cards of this round are dealt
        currentBetUnits.main = getRecommendedBetUnits(tcForBetting);
        currentBetUnits.split = 0; // Reset split bet
        stats.unitsBet += currentBetUnits.main; // Add to session total wagered (initial bet)

        // Deal cards
        dealCard(playerHand, true); dealCard(dealerHand, true);
        dealCard(playerHand, true); dealCard(dealerHand, false);

        renderHands(); updateScores(); updateShoeInfo(); // This now calls updateStatsAndEdgeDisplay

        gamePhase = 'INPUT_GUESSES';
        messageEl.textContent = `Bet: ${currentBetUnits.main} unit(s). Enter RC (visible) & BS.`;
        // ... (rest of startNewHand remains similar)
        rcFeedbackEl.textContent = ''; bsFeedbackEl.textContent = ''; deviationInfoEl.textContent = '';
        runningCountGuessInput.value = ''; strategyGuessInput.value = ''; runningCountGuessInput.focus();
        updateButtonStates(); updateLiveRcDisplay();

        const dealerUpCard = dealerHand.find(card => !card.hidden);
        if (dealerUpCard && dealerUpCard.rank === 'A') { /* ... (insurance info logic same) ... */ }

        if (isBlackjack(playerHand) || isBlackjack(dealerHand)) {
            revealDealerHoleCard(); determineOutcome();
        }
    }

    // handleSubmitGuesses remains largely the same for logic, but ensure TC is available for BS check
    function handleSubmitGuesses() { /* ... (same BS and RC guess logic) ... */
        if (gamePhase !== 'INPUT_GUESSES') return;
        const rcGuess = parseInt(runningCountGuessInput.value);
        const bsGuess = strategyGuessInput.value.toUpperCase();

        if (rcGuess === runningCount) { /* ... (RC feedback) ... */ }
        else { /* ... (RC feedback) ... */ }

        const dealerUpCard = dealerHand.find(card => !card.hidden);
        if (!dealerUpCard) return;
        const currentTrueCount = calculateTrueCount(); // TC for BS deviation check
        const situationKey = getSituationKey(playerHand, dealerUpCard);
        const correctBS = getBasicStrategy(playerHand, dealerUpCard);
        let recommendedPlay = correctBS; let isDeviation = false; let deviationDetails = "";
        const deviationRule = DEVIATIONS_MULTI_DECK_H17[situationKey];
        // ... (rest of deviation logic and feedback population as before) ...
        gamePhase = 'PLAYER_ACTION';
        messageEl.textContent = "Your turn. Choose an action."; updateButtonStates();
    }

    function playerDouble() {
        if (gamePhase !== 'PLAYER_ACTION') return;
        const currentHandRef = isSplitHandActive ? playerSplitHand : playerHand;
        if (currentHandRef.length !== 2) return;

        // Double the bet for the current hand being played
        if (isSplitHandActive) {
            stats.unitsBet += currentBetUnits.split; // Add the original split bet again for the double
            currentBetUnits.split *= 2;
        } else {
            stats.unitsBet += currentBetUnits.main; // Add the original main bet again for the double
            currentBetUnits.main *= 2;
        }
        messageEl.textContent = `Doubled bet on ${isSplitHandActive ? 'split' : 'main'} hand to ${isSplitHandActive ? currentBetUnits.split : currentBetUnits.main} units.`;

        dealCard(currentHandRef, true);
        renderHands(); updateScores(); updateShoeInfo();

        const score = getHandValue(currentHandRef);
        if (score > 21) {
            // Bust logic for double
            const handName = isSplitHandActive ? "Split hand" : "Main hand";
            messageEl.textContent += ` Bust on double! ${handName} value is ${score}.`;
            if (isSplitHandActive) {
                isSplitHandActive = false; // Done with this split hand
                // Check if main hand needs to be played
                if (playerHand.length > 0 && getHandValue(playerHand) <= 21) {
                    if (playerHand.length < 2) dealCard(playerHand, true); // Ensure 2 cards if needed
                    renderHands(); updateScores(); updateShoeInfo();
                    if (isBlackjack(playerHand) || getHandValue(playerHand) === 21) { dealerTurn(); return; }
                    messageEl.textContent += " Playing main hand.";
                    document.getElementById('player-cards').classList.add('active-hand');
                    document.getElementById('player-cards-split').classList.remove('active-hand');
                    gamePhase = 'INPUT_GUESSES'; updateButtonStates(); return;
                } else { // Main hand also done (e.g. busted or already played)
                    dealerTurn(); return;
                }
            } else { // Main hand busted on double
                // If there's a split hand, check if it needs play
                if (playerSplitHand.length > 0 && getHandValue(playerSplitHand) <= 21) {
                    playerStand(); // Will trigger logic to move to split hand
                    return;
                } else { // No split or split hand also done
                    endHand("Player busts on double."); return;
                }
            }
        } else {
            playerStand(); // After double, player automatically stands
        }
    }

    function playerSplit() {
        if (gamePhase !== 'PLAYER_ACTION' || playerHand.length !== 2 || playerHand[0].rank !== playerHand[1].rank || playerSplitHand.length > 0) {
            messageEl.textContent = "Cannot split."; return;
        }

        // Bet for the split hand is same as original main hand bet
        currentBetUnits.split = currentBetUnits.main / (playerHand.length === 2 && playerHand[0].rank === playerHand[1].rank && playerSplitHand.length === 0 ? 1 : 2); // If main was doubled, split gets original
        if(currentBetUnits.main > getRecommendedBetUnits(calculateTrueCount())) { // if main hand was doubled before split was an option
             currentBetUnits.split = currentBetUnits.main / 2; // split bet is half of the doubled main bet.
        } else {
             currentBetUnits.split = getRecommendedBetUnits(calculateTrueCount()); // new bet for split based on TC
        }

        stats.unitsBet += currentBetUnits.split; // Add to session total wagered for the new hand

        playerSplitHand.push(playerHand.pop());
        splitHandAreaEl.style.display = 'block';
        dealCard(playerHand, true); dealCard(playerSplitHand, true);
        renderHands(); updateScores(); updateShoeInfo();

        isSplitHandActive = false;
        document.getElementById('player-cards').classList.add('active-hand');
        document.getElementById('player-cards-split').classList.remove('active-hand');
        messageEl.textContent = `Split successful. Bet ${currentBetUnits.split} on split. Playing first hand (main). Enter guesses.`;
        gamePhase = 'INPUT_GUESSES';
        rcFeedbackEl.textContent = ''; bsFeedbackEl.textContent = ''; deviationInfoEl.textContent = ''; strategyGuessInput.value = '';
        updateButtonStates();
    }


    function revealDealerHoleCard() {
        const holeCard = dealerHand.find(card => card.hidden);
        if (holeCard) {
            holeCard.hidden = false;
            runningCount += holeCard.countValue;
            updateShoeInfo(); // This will update TC and edge display
            updateLiveRcDisplay();
            renderHands(); updateScores();
        }
    }

    function determineOutcome() {
        gamePhase = 'HAND_OVER';
        if (dealerHand.some(c => c.hidden)) revealDealerHoleCard();
        stats.handsPlayed++;

        let finalMessage = "";
        let handNetUnits = 0;

        function getHandResultAndUpdateStats(pHand, dHand, handName, betForThisHand) {
            if (pHand.length === 0) return { msg: "", units: 0 };
            const pScore = getHandValue(pHand);
            const dScore = getHandValue(dHand);
            let resultMsg = `${handName}: `;
            let unitsChange = 0;

            if (pScore > 21) {
                resultMsg += `Bust (${pScore}). Dealer wins.`;
                stats.losses++; unitsChange = -betForThisHand;
            } else if (isBlackjack(pHand) && pHand.length === 2) {
                stats.blackjacks++;
                if (isBlackjack(dHand) && dHand.length === 2) {
                    resultMsg += `Blackjack! Push (${pScore}).`;
                    stats.pushes++; unitsChange = 0;
                } else {
                    resultMsg += `Blackjack! Player wins 3:2! (${pScore}).`;
                    stats.wins++; unitsChange = betForThisHand * 1.5;
                }
            } else if (dScore > 21) {
                resultMsg += `Player wins! Dealer busts (${dScore}). Your score: ${pScore}.`;
                stats.wins++; unitsChange = betForThisHand;
            } else if (pScore > dScore) {
                resultMsg += `Player wins! (${pScore} vs ${dScore}).`;
                stats.wins++; unitsChange = betForThisHand;
            } else if (dScore > pScore) {
                resultMsg += `Dealer wins. (${dScore} vs ${pScore}).`;
                stats.losses++; unitsChange = -betForThisHand;
            } else { // Push
                resultMsg += `Push! (${pScore}).`;
                stats.pushes++; unitsChange = 0;
            }
            return { msg: resultMsg, units: unitsChange };
        }

        const mainHandOutcome = getHandResultAndUpdateStats(playerHand, dealerHand, "Main Hand", currentBetUnits.main);
        finalMessage = mainHandOutcome.msg;
        handNetUnits += mainHandOutcome.units;

        if (playerSplitHand.length > 0) {
            stats.handsPlayed++; // Count split hand as another hand played for W/L/P stats
            const splitHandOutcome = getHandResultAndUpdateStats(playerSplitHand, dealerHand, "Split Hand", currentBetUnits.split);
            finalMessage += "<br>" + splitHandOutcome.msg;
            handNetUnits += splitHandOutcome.units;
        }
        
        stats.unitsNet += handNetUnits;
        messageEl.innerHTML = finalMessage + `<br>Hand Units: ${handNetUnits >= 0 ? '+' : ''}${handNetUnits.toFixed(1)}`;
        updateStatsAndEdgeDisplay(); // Update stats on screen
        updateButtonStates();
    }

    // --- Stats, Edge, Betting Functions ---
    function updateStatsAndEdgeDisplay() {
        statHandsPlayedEl.textContent = stats.handsPlayed;
        statWinsEl.textContent = stats.wins;
        statLossesEl.textContent = stats.losses;
        statPushesEl.textContent = stats.pushes;
        statBlackjacksEl.textContent = stats.blackjacks;

        if (stats.handsPlayed > 0) {
            statWinPctEl.textContent = ((stats.wins / stats.handsPlayed) * 100).toFixed(1);
            statLossPctEl.textContent = ((stats.losses / stats.handsPlayed) * 100).toFixed(1);
            statPushPctEl.textContent = ((stats.pushes / stats.handsPlayed) * 100).toFixed(1);
        } else {
            statWinPctEl.textContent = '0.0';
            statLossPctEl.textContent = '0.0';
            statPushPctEl.textContent = '0.0';
        }
        statUnitsNetEl.textContent = `${stats.unitsNet >= 0 ? '+' : ''}${stats.unitsNet.toFixed(1)}`;

        const currentTC = calculateTrueCount();
        trueCountValueMainEl.textContent = currentTC === null ? "N/A" : currentTC.toFixed(2);

        if (currentTC !== null) {
            const edge = (currentTC - 1) * 0.5; // Simplified edge formula
            perceivedEdgeEl.textContent = `~${edge.toFixed(2)}`;
            recommendedBetEl.textContent = getRecommendedBetUnits(currentTC);
        } else {
            perceivedEdgeEl.textContent = "~N/A";
            recommendedBetEl.textContent = "1"; // Default if TC unknown
        }
    }

    function getRecommendedBetUnits(trueCount) {
        if (trueCount === null || trueCount < 1) return 1;
        if (trueCount >= 6) return 6;
        if (trueCount >= 5) return 5;
        if (trueCount >= 4) return 4;
        if (trueCount >= 3) return 3;
        if (trueCount >= 2) return 2;
        return 1; // For TC +1 or less
    }

    function resetPlayerStats() {
        stats = {
            handsPlayed: 0, wins: 0, losses: 0, pushes: 0,
            blackjacks: 0, unitsBet: 0, unitsNet: 0,
        };
        updateStatsAndEdgeDisplay();
        messageEl.textContent = "Player stats reset. Select shoe size and start new hand.";
        console.log("Player stats reset.");
    }
    resetStatsBtn.addEventListener('click', resetPlayerStats);


    // --- UI Update & Event Listeners ---
    function updateGameTitle() { /* ... (same) ... */ }
    deckSelectEl.addEventListener('change', (event) => { /* ... (same, ensure it calls resetPlayerStats too) ... */
        CURRENT_NUM_DECKS = parseInt(event.target.value);
        console.log(`Decks: ${CURRENT_NUM_DECKS}`);
        messageEl.textContent = `Shoe size changed. Reshuffling... Click "Next Hand".`;
        gamePhase = 'INIT';
        resetPlayerStats(); // Reset stats on deck change
        createShoe(); updateShoeInfo(); updateButtonStates();
        playerHand = []; dealerHand = []; playerSplitHand = [];
        renderHands(); updateScores();
        rcFeedbackEl.textContent = ''; bsFeedbackEl.textContent = ''; deviationInfoEl.textContent = '';
        runningCountGuessInput.value = ''; strategyGuessInput.value = '';
    });
    // ... (other event listeners and initial setup call createShoe, updateShoeInfo, updateButtonStates, updateLiveRcDisplay, updateStatsAndEdgeDisplay)

    // Initial setup
    CURRENT_NUM_DECKS = parseInt(deckSelectEl.value);
    createShoe(); // This initializes everything including first TC/Edge display
    updateStatsAndEdgeDisplay(); // Initial display of stats and edge
    updateButtonStates();
    updateLiveRcDisplay();
    messageEl.textContent = `Welcome! ${CURRENT_NUM_DECKS}-Deck H17. Click "Next Hand".`;
});
