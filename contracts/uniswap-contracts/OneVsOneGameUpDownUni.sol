// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;
import "../interfaces/ITreasury.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "../interfaces/IERC20.sol";
import "../interfaces/IUniswapFactory.sol";

contract OneVsOneGameUpDownUni is Ownable {
    enum Status {
        Created,
        Closed,
        Started,
        Finished,
        Refused
    }
    //разделить игру на два контракта по режимам
    struct BetInfo {
        address token0; // токены пары, можно выбрать ставку к стоимости токена0 к токену1 и наоборот
        address token1;
        address initiator;
        uint48 startTime;
        uint48 endTime;
        address opponent;
        bool willGoUp; //что выбрал инициатор игры
        uint256 betAmount;
        uint256 startingAssetPrice;
        uint256 finalAssetPrice;
        Status gameStatus;
    }

    mapping(uint256 => BetInfo) public games;
    uint256 public totalBets;
    address public treasury;

    constructor() Ownable(msg.sender) {}

    function createBet(
        address opponent,
        uint48 startTime,
        uint48 endTime,
        bool willGoUp,
        uint256 betAmount,
        address uniFactory,
        address token0,
        address token1
    ) public {
        require(
            endTime - startTime >= 30 minutes,
            "Min bet duration must be 30 minutes"
        );
        require(
            endTime - startTime <= 24 weeks,
            "Max bet duration must be 6 month"
        );
        require(betAmount >= 10000000000000000000, "Wrong bet amount");
        BetInfo memory newBet;
        newBet.initiator = msg.sender;
        newBet.startTime = startTime;
        newBet.endTime = endTime;
        ITreasury(treasury).deposit(betAmount, msg.sender);
        newBet.betAmount = betAmount;
        newBet.opponent = opponent;
        newBet.willGoUp = willGoUp;
        newBet.token0 = token0;
        newBet.token1 = token1;
        newBet.gameStatus = Status.Created;
        newBet.startingAssetPrice = getTokenPrice(token0, token1, uniFactory);
        games[totalBets++] = newBet;
        //добавить event
    }

    function acceptBet(uint256 betId) public {
        BetInfo memory bet = games[betId];
        require(bet.gameStatus == Status.Created, "Wrong status!");
        require(
            bet.startTime + (bet.endTime - bet.startTime) / 3 >=
                block.timestamp,
            "Time is up"
        );
        //Если не приватная игра, то адрес будет 0
        if (bet.opponent != address(0)) {
            require(
                msg.sender == bet.opponent,
                "Only certain account can accept"
            );
        } else {
            bet.opponent == msg.sender;
        }
        ITreasury(treasury).deposit(bet.betAmount, msg.sender);
        bet.gameStatus = Status.Started;
        games[betId] = bet;
    }

    function refuseBet(uint256 betId) public {
        BetInfo memory bet = games[betId];
        require(bet.gameStatus == Status.Created, "Wrong status!");
        require(msg.sender == bet.opponent, "Only opponent can refuse");
        bet.gameStatus = Status.Refused;
        games[betId] = bet;
    }

    function closeBet(uint256 betId) public {
        BetInfo memory bet = games[betId];
        require(bet.initiator == msg.sender, "Wrong sender");
        require(
            bet.gameStatus == Status.Refused ||
                (bet.startTime + (bet.endTime - bet.startTime) / 3 <
                    block.timestamp &&
                    bet.gameStatus == Status.Created),
            "Wrong status!"
        );
        ITreasury(treasury).refund(bet.betAmount, bet.initiator);
        games[betId].gameStatus = Status.Closed;
        games[betId] = bet;
    }

    //only owner
    function endGame(uint256 betId, address uniFactory) public onlyOwner {
        BetInfo memory bet = games[betId];
        uint256 finalPrice = getTokenPrice(bet.token0, bet.token1, uniFactory);
        require(bet.gameStatus == Status.Started, "Wrong status!");
        require(block.timestamp >= bet.endTime, "Too early to finish");
        if (
            bet.willGoUp
                ? bet.startingAssetPrice < finalPrice
                : bet.startingAssetPrice > finalPrice
        ) {
            ITreasury(treasury).distribute(bet.betAmount, bet.initiator, bet.betAmount);
        } else {
            ITreasury(treasury).distribute(bet.betAmount, bet.opponent, bet.betAmount);
        }
        bet.finalAssetPrice = finalPrice;
        bet.gameStatus = Status.Finished;
        games[betId] = bet;
    }

    function getTokenPrice(
        address token0,
        address token1,
        address uniFactory
    ) public view returns (uint256 finalPrice) {
        IUniswapV2Pair pair = IUniswapV2Pair(
            IUniswapFactory(uniFactory).getPair(token0, token1)
        );
        (uint256 reserve0, uint256 reserve1, ) = pair.getReserves();
        if (token0 == pair.token1()) {
            uint256 amount = reserve0 *
                (10 ** IERC20(pair.token1()).decimals());
                finalPrice = amount / reserve1;
            return finalPrice; // return amount of token0 needed to buy token1
        } else if (token0 == pair.token0()) {
            uint256 amount = reserve1 *
                (10 ** IERC20(pair.token0()).decimals());
                finalPrice = amount / reserve1;
            return finalPrice; // return amount of token1 needed to buy token0
        }
    }

    function setTreasury(address newTreasury) public onlyOwner {
        treasury = newTreasury;
    }
}