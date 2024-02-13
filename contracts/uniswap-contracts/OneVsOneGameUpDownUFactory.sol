// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;
import "../interfaces/ITreasury.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "../interfaces/IERC20.sol";
import "../interfaces/IUniswapFactory.sol";

contract OneVsOneGameUpDownUFactory is Ownable {
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

    BetInfo public game;
    address public treasury;

    constructor(
        address opponent,
        uint48 startTime,
        uint48 endTime,
        bool willGoUp,
        uint256 betAmount,
        address initiator,
        address uniFactory,
        address token0,
        address token1
    ) Ownable(msg.sender) {
        game.initiator = initiator;
        game.startTime = startTime;
        game.endTime = endTime;
        game.betAmount = betAmount;
        game.opponent = opponent;
        game.willGoUp = willGoUp;
        game.token0 = token0;
        game.token1 = token1;
        game.gameStatus = Status.Created;
        game.startingAssetPrice = getTokenPrice(token0, token1, uniFactory);
    }

    function acceptBet() public {
        require(game.gameStatus == Status.Created, "Wrong status!");
        require(
            game.startTime + (game.endTime - game.startTime) / 3 >=
                block.timestamp,
            "Time is up"
        );
        //Если не приватная игра, то адрес будет 0
        if (game.opponent != address(0)) {
            require(
                msg.sender == game.opponent,
                "Only certain account can accept"
            );
        } else {
            game.opponent == msg.sender;
        }
        ITreasury(treasury).deposit(game.betAmount, msg.sender);
        game.gameStatus = Status.Started;
    }

    function refuseBet() public {
        require(game.gameStatus == Status.Created, "Wrong status!");
        require(msg.sender == game.opponent, "Only opponent can refuse");
        game.gameStatus = Status.Refused;
    }

    function closeBet() public {
        require(game.initiator == msg.sender, "Wrong sender");
        require(
            game.gameStatus == Status.Refused ||
                (game.startTime + (game.endTime - game.startTime) / 3 <
                    block.timestamp &&
                    game.gameStatus == Status.Created),
            "Wrong status!"
        );
        ITreasury(treasury).refund(game.betAmount, game.initiator);
        game.gameStatus = Status.Closed;
    }

    //only owner
    function endGame(address uniFactory) public onlyOwner {
        uint256 finalPrice = getTokenPrice(game.token0, game.token1, uniFactory);
        require(game.gameStatus == Status.Started, "Wrong status!");
        require(block.timestamp >= game.endTime, "Too early to finish");
        if (
            game.willGoUp
                ? game.startingAssetPrice < finalPrice
                : game.startingAssetPrice > finalPrice
        ) {
            ITreasury(treasury).distribute(game.betAmount, game.initiator, game.betAmount);
        } else {
            ITreasury(treasury).distribute(game.betAmount, game.opponent, game.betAmount);
        }
        game.finalAssetPrice = finalPrice;
        game.gameStatus = Status.Finished;
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