import config


def test_expand_street_replaces_whole_tokens():
    assert config.expand_street("ANG MO KIO AVE 3") == "ANG MO KIO AVENUE 3"
    assert config.expand_street("JLN BT MERAH") == "JALAN BUKIT MERAH"
    assert config.expand_street("C'WEALTH CRES") == "COMMONWEALTH CRESCENT"


def test_expand_street_keeps_st_distinct_from_st_dot():
    assert config.expand_street("YISHUN ST 11") == "YISHUN STREET 11"
    assert config.expand_street("ST. GEORGE'S RD") == "SAINT GEORGE'S ROAD"


def test_expand_street_leaves_numerals_and_unknown_tokens():
    assert config.expand_street("TAMPINES 8") == "TAMPINES 8"


def test_slugify_and_make_id():
    assert config.slugify("ANG MO KIO AVE 3") == "ang-mo-kio-ave-3"
    assert config.make_id("123", "ANG MO KIO AVE 3") == "123-ang-mo-kio-ave-3"
    assert config.make_id("1A", "C'WEALTH CRES") == "1a-c-wealth-cres"


def test_paths_are_absolute_and_rooted():
    assert config.PIPELINE_DIR.name == "pipeline"
    assert config.APP_DATA_DIR.parts[-3:] == ("app", "public", "data")
