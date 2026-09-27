"""Species a visit can be for. frontend/src/lib/species.ts mirrors this list (tests/test_species.py
checks they match). Cats and dogs have templates, breeds and learned patterns; the rest start from
the price list (or templates the clinic adds for them)."""

# id -> (singular noun, plural noun), lowercase as used in sentences ("a 3-year-old guinea pig").
SPECIES: dict[str, tuple[str, str]] = {
    "cat": ("cat", "cats"),
    "dog": ("dog", "dogs"),
    "rabbit": ("rabbit", "rabbits"),
    "guinea-pig": ("guinea pig", "guinea pigs"),
    "hamster": ("hamster", "hamsters"),
    "gerbil": ("gerbil", "gerbils"),
    "rat": ("rat", "rats"),
    "mouse": ("mouse", "mice"),
    "chinchilla": ("chinchilla", "chinchillas"),
    "ferret": ("ferret", "ferrets"),
    "hedgehog": ("hedgehog", "hedgehogs"),
    "sugar-glider": ("sugar glider", "sugar gliders"),
    "parrot": ("parrot", "parrots"),
    "budgie": ("budgie", "budgies"),
    "cockatiel": ("cockatiel", "cockatiels"),
    "canary": ("canary", "canaries"),
    "chicken": ("chicken", "chickens"),
    "duck": ("duck", "ducks"),
    "bearded-dragon": ("bearded dragon", "bearded dragons"),
    "leopard-gecko": ("leopard gecko", "leopard geckos"),
    "snake": ("snake", "snakes"),
    "turtle": ("turtle", "turtles"),
    "tortoise": ("tortoise", "tortoises"),
    "fish": ("fish", "fish"),
    "horse": ("horse", "horses"),
    "goat": ("goat", "goats"),
    "pig": ("pig", "pigs"),
    "other": ("animal", "animals"),  # anything else; the breed field can say what it is
}

SPECIES_IDS: tuple[str, ...] = tuple(SPECIES)


def noun(species: str) -> str:
    """'guinea-pig' -> 'guinea pig' (unknown ids come back unchanged)."""
    return SPECIES.get(species, (species, species))[0]


def plural(species: str) -> str:
    """'mouse' -> 'mice'."""
    return SPECIES.get(species, (species, f"{species}s"))[1]
