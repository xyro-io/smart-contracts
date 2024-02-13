// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;
import "../interfaces/ITreasury.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "../interfaces/IERC20.sol";
import "../interfaces/IUniswapFactory.sol";

contract OneVsOneGameExactPriceUFactory is Ownable {
    enum Status {
        Created,
        Closed,
        Started,
        Finished,
        Refused
    }
    struct BetInfo {
        address token0; // токены пары, можно выбрать ставку к стоимости токена0 к токену1 и наоборот
        address token1;
        address initiator;
        uint48 startTime;
        uint48 endTime;
        address opponent;
        uint256 betAmount;
        uint256 initiatorPrice;
        uint256 opponentPrice;
        uint256 finalAssetPrice;
        Status gameStatus;
    }

    BetInfo public game;
    address public treasury;

    constructor(
        address opponent,
        uint48 startTime,
        uint48 endTime,
        uint256 initiatorPrice,
        uint256 betAmount,
        address initiator,
        address token0,
        address token1
    ) Ownable(msg.sender) {
        game.initiator = initiator;
        game.startTime = startTime;
        game.endTime = endTime;
        game.initiatorPrice = initiatorPrice;
        game.betAmount = betAmount;
        game.opponent = opponent;
        game.gameStatus = Status.Created;
        game.token0 = token0;
        game.token1 = token1;
    }

    function acceptBet(uint256 opponentPrice) public {
        require(game.gameStatus == Status.Created, "Wrong status!");
        require(
            game.startTime + (game.endTime - game.startTime) / 3 >=
                block.timestamp,
            "Time is up"
        );
        require(game.initiatorPrice != opponentPrice, "Same asset prices");
        //Если не приватная игра, то адрес будет 0
        if (game.opponent != address(0)) {
            require(
                msg.sender == game.opponent,
                "Only certain account can accept"
            );
            if (opponentPrice == 0) {
                game.gameStatus = Status.Refused;
                return;
            }
        } else {
            game.opponent == msg.sender;
        }
        game.opponentPrice = opponentPrice;
        ITreasury(treasury).deposit(game.betAmount, msg.sender);
        game.gameStatus = Status.Started;
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
        //Можно сделать чтобы токены передавались только бэком, а пару хранить в структуре
        uint256 finalPrice = getTokenPrice(
            game.token0,
            game.token1,
            uniFactory
        );
        require(game.gameStatus == Status.Started, "Wrong status!");
        require(block.timestamp >= game.endTime, "Too early to finish");
        uint256 diff1 = game.initiatorPrice > finalPrice
            ? game.initiatorPrice - finalPrice
            : finalPrice - game.initiatorPrice;
        uint256 diff2 = game.opponentPrice > finalPrice
            ? game.opponentPrice - finalPrice
            : finalPrice - game.opponentPrice;

        if (diff1 < diff2) {
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
    ) public view returns (uint256) {
        IUniswapV2Pair pair = IUniswapV2Pair(
            IUniswapFactory(uniFactory).getPair(token0, token1)
        );
        (uint256 reserve0, uint256 reserve1, ) = pair.getReserves();
        if (token0 == pair.token1()) {
            uint256 amount = reserve0 *
                (10 ** IERC20(pair.token1()).decimals());
            return ((amount) / reserve1); // return amount of token0 needed to buy token1
        } else if (token0 == pair.token0()) {
            uint256 amount = reserve1 *
                (10 ** IERC20(pair.token0()).decimals());
            return ((amount) / reserve0); // return amount of token1 needed to buy token0
        }
    }

    function setTreasury(address newTreasury) public onlyOwner {
        treasury = newTreasury;
    }
}